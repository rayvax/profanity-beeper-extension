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
  return new DelayedCensoredPlaybackImpl(getMedia, options);
}

class DelayedCensoredPlaybackImpl implements DelayedCensoredPlayback {
  readonly audioInput: PcmAudioInput;
  private readonly currentOptions: DelayedCensoredPlaybackOptions;
  private readonly listeners = new Set<(pcm: ArrayBuffer) => void>();
  private sampleRatePromise = createPendingPromise<number>();
  private graph: PlaybackGraph | undefined;

  constructor(
    private readonly getMedia: () => HTMLMediaElement | null,
    options: DelayedCensoredPlaybackOptions,
  ) {
    this.currentOptions = { ...options };
    this.audioInput = new DelayedPlaybackAudioInput(
      () => this.sampleRatePromise.promise,
      this.listeners,
    );
  }

  updateOptions(
    nextOptions: Pick<DelayedCensoredPlaybackOptions, 'delaySeconds' | 'effect'>,
  ): void {
    const delayDelta = nextOptions.delaySeconds - this.currentOptions.delaySeconds;
    this.currentOptions.delaySeconds = nextOptions.delaySeconds;
    this.currentOptions.effect = nextOptions.effect;
    if (this.graph?.active) {
      const now = this.graph.context.currentTime;
      setDelay(this.graph.delay, this.graph.context, this.currentOptions.delaySeconds);
      this.graph.windows = this.graph.windows
        .filter((window) => window.end > now)
        .map((window) => ({
          ...window,
          start: window.start + delayDelta,
          end: window.end + delayDelta,
        }));
      this.graph.scheduler.replace(this.graph.windows, this.currentOptions.effect);
    }
  }

  async arm(): Promise<void> {
    const media = this.getMedia();
    if (!media) throw new Error('Player media not found');

    if (this.graph?.media !== media) {
      this.graph = await createGraph(media, this.currentOptions, this.listeners);
    } else if (!this.graph.active) {
      setDelay(this.graph.delay, this.graph.context, this.currentOptions.delaySeconds);
      this.graph.active = true;
      this.graph.tap = await createTap(
        this.graph.context,
        this.currentOptions.workletUrl,
        this.listeners,
      );
      this.graph.source.connect(this.graph.tap);
    }

    if (this.graph.context.state === 'suspended') {
      await this.graph.context.resume();
    }
    this.sampleRatePromise.resolve(this.graph.context.sampleRate);
  }

  async execute(range: DelayedCensorRange): Promise<void> {
    if (!this.graph?.active) {
      throw new Error('Delayed playback is not armed');
    }
    scheduleCensorRange(this.graph, range, this.currentOptions);
  }

  stop(): void {
    this.listeners.clear();
    this.sampleRatePromise = createPendingPromise<number>();
    if (!this.graph) return;

    disconnectTap(this.graph);
    this.graph.delay.delayTime.cancelScheduledValues(this.graph.context.currentTime);
    this.graph.delay.delayTime.setValueAtTime(0, this.graph.context.currentTime);
    this.graph.windows = [];
    this.graph.scheduler.stop();
    this.graph.active = false;
  }
}

class DelayedPlaybackAudioInput implements PcmAudioInput {
  constructor(
    private readonly getSampleRate: () => Promise<number>,
    private readonly listeners: Set<(pcm: ArrayBuffer) => void>,
  ) {}

  get sampleRate(): Promise<number> {
    return this.getSampleRate();
  }

  subscribe(listener: (pcm: ArrayBuffer) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
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
  const playbackRate = graph.media.playbackRate || 1;
  const start = Math.max(
    now + 0.005,
    now +
      (range.startTime - graph.media.currentTime) / playbackRate +
      options.delaySeconds -
      padding,
  );
  const end = Math.max(
    start + MIN_WINDOW_SECONDS,
    now + (range.endTime - graph.media.currentTime) / playbackRate + options.delaySeconds + padding,
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
