import { acquireMediaGraph } from './media-graph';

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
  stop(): void;
};

export type DelayedCensoredPlaybackOptions = {
  delaySeconds: number;
  beep: boolean;
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
  oscillator?: OscillatorNode;
};

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
    async arm() {
      const media = getMedia();
      if (!media) throw new Error('Player media not found');

      if (graph?.media !== media) {
        graph = await createGraph(media, options, listeners);
      } else if (!graph.active) {
        setDelay(graph.delay, graph.context, options.delaySeconds);
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
      scheduleCensorRange(graph, range, options);
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
  const tap = await createTap(context, options.workletUrl, listeners);
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

  graph.gain.gain.cancelScheduledValues(now);
  if (merged) {
    graph.gain.gain.setValueAtTime(0, now);
  } else {
    graph.gain.gain.setValueAtTime(1, Math.max(now, start - 0.01));
    graph.gain.gain.linearRampToValueAtTime(0, start);
  }
  graph.gain.gain.setValueAtTime(0, windowEnd);
  graph.gain.gain.linearRampToValueAtTime(1, windowEnd + 0.01);
  graph.mutedUntil = windowEnd;

  if (!options.beep) return;
  if (!merged || !graph.oscillator) {
    const oscillator = graph.context.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(graph.context.destination);
    oscillator.onended = () => {
      if (graph.oscillator === oscillator) graph.oscillator = undefined;
    };
    oscillator.start(start);
    graph.oscillator = oscillator;
  }
  graph.oscillator.stop(windowEnd);
}

function restoreGain(graph: PlaybackGraph): void {
  graph.gain.gain.cancelScheduledValues(graph.context.currentTime);
  graph.gain.gain.setValueAtTime(1, graph.context.currentTime);
  graph.mutedUntil = graph.context.currentTime;
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
