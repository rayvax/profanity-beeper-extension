import { acquireMediaGraph } from './media-graph';
import type { CensorAudioEffectValue } from './censor-effect';
import {
  createCensorWindowScheduler,
  type CensorAudioWindow,
  type CensorWindowScheduler,
} from './censor-window-scheduler';

export type DelayedCensorRange = {
  startTime: number;
  endTime: number;
  final?: boolean;
  token?: string;
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
  provisionalPaddingSeconds?: number;
  mergeGapSeconds?: number;
};

type PlaybackGraph = {
  context: AudioContext;
  media: HTMLMediaElement;
  source: MediaElementAudioSourceNode;
  delay: DelayNode;
  tap?: AudioNode;
  active: boolean;
  windows: ScheduledCensorWindow[];
  scheduler: CensorWindowScheduler;
};

type ScheduledCensorWindow = CensorAudioWindow & {
  final?: boolean;
  token?: string;
};

const DEFAULT_PADDING_SECONDS = 0.15;
const DEFAULT_PROVISIONAL_PADDING_SECONDS = 0.02;
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
      const delayDelta = nextOptions.delaySeconds - currentOptions.delaySeconds;
      currentOptions.delaySeconds = nextOptions.delaySeconds;
      currentOptions.effect = nextOptions.effect;
      if (graph?.active) {
        const now = graph.context.currentTime;
        setDelay(graph.delay, graph.context, currentOptions.delaySeconds);
        graph.windows = graph.windows
          .filter((window) => window.end > now)
          .map((window) => ({
            ...window,
            start: window.start + delayDelta,
            end: window.end + delayDelta,
          }));
        graph.scheduler.replace(graph.windows, currentOptions.effect);
      }
    },
    async arm() {
      const media = getMedia();
      if (!media) throw new Error('Player media not found');

      if (graph?.media !== media) {
        graph = await createGraph(media, currentOptions, listeners);
      } else if (!graph.active) {
        setDelay(graph.delay, graph.context, currentOptions.delaySeconds);
        graph.active = true;
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
      graph.delay.delayTime.cancelScheduledValues(graph.context.currentTime);
      graph.delay.delayTime.setValueAtTime(0, graph.context.currentTime);
      graph.windows = [];
      graph.scheduler.stop();
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
    tap,
    active: true,
    windows: [],
    scheduler: createCensorWindowScheduler(
      context,
      shared.gain,
      options.mergeGapSeconds ?? DEFAULT_MERGE_GAP_SECONDS,
    ),
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
  const padding =
    range.final === false
      ? (options.provisionalPaddingSeconds ?? DEFAULT_PROVISIONAL_PADDING_SECONDS)
      : (options.paddingSeconds ?? DEFAULT_PADDING_SECONDS);
  const start = Math.max(
    now + 0.005,
    now + range.startTime - graph.media.currentTime + options.delaySeconds - padding,
  );
  const end = Math.max(
    start + MIN_WINDOW_SECONDS,
    now + range.endTime - graph.media.currentTime + options.delaySeconds + padding,
  );
  const pending = graph.windows.filter((window) => window.end >= now);
  graph.windows =
    range.final && range.token
      ? pending.filter((window) => window.final !== false || window.token !== range.token)
      : pending;
  graph.windows.push({ start, end, final: range.final, token: range.token });
  graph.scheduler.replace(graph.windows, options.effect);
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
