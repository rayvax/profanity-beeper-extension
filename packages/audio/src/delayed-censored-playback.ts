import { acquireMediaGraph } from './media-graph';
import { scheduleCensorEffect, type CensorAudioEffectValue } from './censor-effect';

export type DelayedCensorRange = {
  startTime: number;
  endTime: number;
};

export type PcmAudioInput = {
  readonly sampleRate: Promise<number>;
  subscribe(listener: (pcm: ArrayBuffer) => void): () => void;
};

export type DelayedCensoredPlayback = {
  readonly audioInput: PcmAudioInput;
  arm(): Promise<void>;
  execute(range: DelayedCensorRange): Promise<void>;
  updateOptions(options: Pick<DelayedCensoredPlaybackOptions, 'delaySeconds' | 'effect'>): void;
  stop(): void;
};

export type DelayedCensoredPlaybackOptions = {
  delaySeconds: number;
  effect: CensorAudioEffectValue;
  workletUrl: string;
  paddingSeconds?: number;
  mergeGapSeconds?: number;
};

type PlaybackGraph = {
  context: AudioContext;
  media: HTMLMediaElement;
  source: MediaElementAudioSourceNode;
  delay: DelayNode;
  gain: GainNode;
  tap?: AudioNode;
  active: boolean;
  mutedUntil: number;
  windows: CensorWindow[];
  oscillator?: OscillatorNode;
};

type CensorWindow = { start: number; end: number };

const DEFAULT_PADDING_SECONDS = 0.15;
const DEFAULT_MERGE_GAP_SECONDS = 0.05;
const MIN_WINDOW_SECONDS = 0.05;

/**
 * Delivers the viewer-facing audio late enough for local recognition to
 * schedule a shared beep-or-silence effect before the matching word arrives.
 */
export function createDelayedCensoredPlayback(
  getMedia: () => HTMLMediaElement | null,
  options: DelayedCensoredPlaybackOptions,
): DelayedCensoredPlayback {
  const currentOptions = { ...options };
  const listeners = new Set<(pcm: ArrayBuffer) => void>();
  let sampleRatePromise = createPendingPromise<number>();
  let graph: PlaybackGraph | undefined;

  const audioInput: PcmAudioInput = {
    get sampleRate() {
      return sampleRatePromise.promise;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    audioInput,
    updateOptions(nextOptions) {
      currentOptions.delaySeconds = nextOptions.delaySeconds;
      currentOptions.effect = nextOptions.effect;
      if (graph?.active) setDelay(graph.delay, graph.context, currentOptions.delaySeconds);
    },
    async arm() {
      const media = getMedia();
      if (!media) throw new Error('Player media not found');

      if (graph?.media !== media) {
        graph = await createGraph(media, currentOptions, listeners);
      } else if (!graph.active) {
        setDelay(graph.delay, graph.context, currentOptions.delaySeconds);
        graph.active = true;
        graph.mutedUntil = graph.context.currentTime;
        graph.tap = await createTap(graph.context, options.workletUrl, listeners);
        graph.source.connect(graph.tap);
      }

      if (graph.context.state === 'suspended') {
        await graph.context.resume();
      }
      sampleRatePromise.resolve(graph.context.sampleRate);
    },
    async execute(range) {
      if (!graph?.active) {
        throw new Error('Delayed playback is not armed');
      }
      scheduleCensorRange(graph, range, currentOptions);
    },
    stop() {
      listeners.clear();
      sampleRatePromise = createPendingPromise<number>();
      if (!graph) return;

      disconnectTap(graph);
      graph.oscillator?.stop();
      graph.oscillator = undefined;
      graph.delay.delayTime.cancelScheduledValues(graph.context.currentTime);
      graph.delay.delayTime.setValueAtTime(0, graph.context.currentTime);
      restoreGain(graph);
      graph.active = false;
    },
  };
}

async function createGraph(
  media: HTMLMediaElement,
  options: DelayedCensoredPlaybackOptions,
  listeners: Set<(pcm: ArrayBuffer) => void>,
): Promise<PlaybackGraph> {
  const shared = await acquireMediaGraph(media);
  const { context } = shared;
  setDelay(shared.delay, context, options.delaySeconds);
  let tap: AudioNode;
  try {
    tap = await createTap(context, options.workletUrl, listeners);
  } catch (error) {
    // The shared graph already routes the media at this point. Restore its
    // pass-through state before surfacing the arm failure.
    setDelay(shared.delay, context, 0);
    shared.gain.gain.cancelScheduledValues(context.currentTime);
    shared.gain.gain.setValueAtTime(1, context.currentTime);
    throw error;
  }
  shared.source.connect(tap);
  return {
    context,
    media,
    source: shared.source,
    delay: shared.delay,
    gain: shared.gain,
    tap,
    active: true,
    mutedUntil: context.currentTime,
    windows: [],
  };
}

function setDelay(delay: DelayNode, context: AudioContext, seconds: number): void {
  delay.delayTime.cancelScheduledValues(context.currentTime);
  delay.delayTime.setValueAtTime(seconds, context.currentTime);
}

function disconnectTap(graph: PlaybackGraph): void {
  if (!graph.tap) return;
  // The tap is fed from the shared source node; drop both ends of the link.
  try {
    graph.source.disconnect(graph.tap);
  } catch {
    // Already disconnected.
  }
  graph.tap.disconnect();
  graph.tap = undefined;
}

async function createTap(
  context: AudioContext,
  workletUrl: string,
  listeners: Set<(pcm: ArrayBuffer) => void>,
): Promise<AudioNode> {
  try {
    await context.audioWorklet.addModule(workletUrl);
    const tap = new AudioWorkletNode(context, 'bleep-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    tap.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      listeners.forEach((listener) => listener(event.data));
    };
    return tap;
  } catch {
    const tap = context.createScriptProcessor(4_096, 1, 1);
    tap.onaudioprocess = (event) => {
      const pcm = event.inputBuffer.getChannelData(0).slice().buffer;
      listeners.forEach((listener) => listener(pcm.slice(0)));
    };
    const silentSink = context.createGain();
    silentSink.gain.value = 0;
    tap.connect(silentSink);
    silentSink.connect(context.destination);
    return tap;
  }
}

function scheduleCensorRange(
  graph: PlaybackGraph,
  range: DelayedCensorRange,
  options: DelayedCensoredPlaybackOptions,
): void {
  const now = graph.context.currentTime;
  const padding = options.paddingSeconds ?? DEFAULT_PADDING_SECONDS;
  const mergeGap = options.mergeGapSeconds ?? DEFAULT_MERGE_GAP_SECONDS;
  const start = Math.max(
    now + 0.005,
    now + range.startTime - graph.media.currentTime + options.delaySeconds - padding,
  );
  const end = Math.max(
    start + MIN_WINDOW_SECONDS,
    now + range.endTime - graph.media.currentTime + options.delaySeconds + padding,
  );
  const merged = start <= graph.mutedUntil + mergeGap;
  const windowEnd = Math.max(end, graph.mutedUntil);

  graph.windows = mergeWindows(
    [...graph.windows.filter((window) => window.end >= now), { start, end }],
    mergeGap,
  );
  scheduleGainWindows(graph, now);
  graph.mutedUntil = windowEnd;

  const activeOscillator = merged ? graph.oscillator : undefined;
  const oscillator = scheduleCensorEffect(
    graph.context,
    options.effect,
    start,
    windowEnd,
    activeOscillator,
    () => {
      if (graph.oscillator === oscillator) graph.oscillator = undefined;
    },
  );
  graph.oscillator = oscillator;
}

function restoreGain(graph: PlaybackGraph): void {
  graph.gain.gain.cancelScheduledValues(graph.context.currentTime);
  graph.gain.gain.setValueAtTime(1, graph.context.currentTime);
  graph.mutedUntil = graph.context.currentTime;
  graph.windows = [];
}

function mergeWindows(windows: CensorWindow[], mergeGap: number): CensorWindow[] {
  return windows
    .sort((left, right) => left.start - right.start)
    .reduce<CensorWindow[]>((merged, window) => {
      const previous = merged.at(-1);
      if (previous && window.start <= previous.end + mergeGap) {
        previous.end = Math.max(previous.end, window.end);
      } else {
        merged.push({ ...window });
      }
      return merged;
    }, []);
}

function scheduleGainWindows(graph: PlaybackGraph, now: number): void {
  const fadeSeconds = 0.01;
  graph.gain.gain.cancelScheduledValues(now);
  const active = graph.windows.some((window) => window.start <= now && window.end > now);
  graph.gain.gain.setValueAtTime(active ? 0 : 1, now);

  graph.windows.forEach((window) => {
    if (window.end <= now) return;
    if (window.start > now) {
      graph.gain.gain.setValueAtTime(1, Math.max(now, window.start - fadeSeconds));
      graph.gain.gain.linearRampToValueAtTime(0, window.start);
    }
    graph.gain.gain.setValueAtTime(0, window.end);
    graph.gain.gain.linearRampToValueAtTime(1, window.end + fadeSeconds);
  });
}

function createPendingPromise<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
