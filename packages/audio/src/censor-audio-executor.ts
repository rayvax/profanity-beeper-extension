import {
  CensorEffect,
  type CensorEffectValue,
  type CensorRange,
  type CensorExecutor,
} from '@beeper/core';
import { CensorWindowScheduler, type CensorAudioWindow } from './censor-window-scheduler';
import { acquireMediaGraph } from './media-graph';

export type CensorAudioOptions = { effect?: CensorEffectValue };

type PlaybackGraph = {
  context: AudioContext;
  media: HTMLMediaElement;
  scheduler: CensorWindowScheduler;
};

type ScheduledRange = {
  range: CensorRange;
  timer?: ReturnType<typeof setTimeout>;
};

export class CensorAudioExecutor implements CensorExecutor {
  readonly activation = { kind: 'on-execute' } as const;
  private readonly failureListeners = new Set<(error: unknown) => void>();

  private effect: CensorEffectValue;
  private graph: PlaybackGraph | undefined;
  private pendingGraph: { media: HTMLMediaElement; promise: Promise<PlaybackGraph> } | undefined;
  private readonly scheduledRanges = new Set<ScheduledRange>();
  private listeningTo: HTMLMediaElement | undefined;
  private generation = 0;
  private waitingForPlayback = false;
  private readonly playbackListeners: PlaybackListeners;

  constructor(
    private readonly getMedia: () => HTMLMediaElement | null,
    options: CensorAudioOptions = {},
  ) {
    this.effect = options.effect ?? CensorEffect.BEEP;
    this.playbackListeners = {
      reschedule: () => this.reschedule(),
      suspend: () => {
        this.waitingForPlayback = true;
        this.reschedule();
      },
      resume: () => {
        this.waitingForPlayback = false;
        this.reschedule();
      },
    };
  }

  updateOptions(nextOptions: CensorAudioOptions): void {
    this.effect = nextOptions.effect ?? CensorEffect.BEEP;
    this.reschedule();
  }

  onError(listener: (error: unknown) => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  async arm(): Promise<void> {
    const media = this.getMedia();
    if (!media) throw new Error('Player media not found');
    const armGeneration = this.generation;
    const playbackGraph = await this.ensureGraph(media);
    // The graph was discarded as stale (stopped mid-arm); nothing to do.
    if (armGeneration !== this.generation || this.graph !== playbackGraph) return;
    this.listenTo(media);
    this.reschedule();
  }

  async execute(range: CensorRange): Promise<void> {
    const media = this.getMedia();
    if (!media) throw new Error('Player media not found');
    const executeGeneration = this.generation;
    const scheduledRange: ScheduledRange = { range };
    this.scheduledRanges.add(scheduledRange);

    try {
      // Timedtext stays real-time: create its graph when the first range is
      // known. A blocked context rejects below and the session fails open.
      const playbackGraph = await this.ensureGraph(media);
      if (executeGeneration !== this.generation || this.graph !== playbackGraph) {
        throw new Error('Censor executor stopped');
      }
      this.listenTo(media);
      this.reschedule();
    } catch (error) {
      this.scheduledRanges.delete(scheduledRange);
      throw error;
    }
  }

  stop(): void {
    this.generation += 1;
    this.pendingGraph = undefined;
    detachPlaybackListeners(this.listeningTo, this.playbackListeners);
    this.listeningTo = undefined;
    this.waitingForPlayback = false;
    this.scheduledRanges.forEach((scheduledRange) => clearTimeout(scheduledRange.timer));
    this.scheduledRanges.clear();
    this.graph?.scheduler.stop();
  }

  private reschedule(): void {
    try {
      this.rescheduleWindows();
    } catch (error) {
      this.stop();
      this.failureListeners.forEach((listener) => listener(error));
    }
  }

  private rescheduleWindows(): void {
    this.scheduledRanges.forEach((scheduledRange) => clearTimeout(scheduledRange.timer));
    const currentGraph = this.graph;
    if (!currentGraph || currentGraph.media.paused || this.waitingForPlayback) {
      currentGraph?.scheduler.replace([], this.effect);
      return;
    }

    const now = currentGraph.context.currentTime;
    const mediaTime = currentGraph.media.currentTime;
    const playbackRate = currentGraph.media.playbackRate;
    const windows: CensorAudioWindow[] = [];

    this.scheduledRanges.forEach((scheduledRange) => {
      const { range } = scheduledRange;
      if (range.endTime <= mediaTime) {
        this.scheduledRanges.delete(scheduledRange);
        return;
      }
      windows.push({
        start: now + Math.max(0, (range.startTime - mediaTime) / playbackRate),
        end: now + (range.endTime - mediaTime) / playbackRate,
      });
      scheduledRange.timer = setTimeout(
        () => {
          // A wall-clock timeout may fire while YouTube is buffering. Keep the
          // range until the media timeline itself reaches its end.
          this.reschedule();
        },
        Math.max(0, ((range.endTime - mediaTime) / playbackRate) * 1_000),
      );
    });

    currentGraph.scheduler.replace(windows, this.effect);
  }

  private listenTo(media: HTMLMediaElement): void {
    if (this.listeningTo === media) return;
    detachPlaybackListeners(this.listeningTo, this.playbackListeners);
    this.waitingForPlayback = false;
    attachPlaybackListeners(media, this.playbackListeners);
    this.listeningTo = media;
  }

  private ensureGraph(media: HTMLMediaElement): Promise<PlaybackGraph> {
    if (this.graph?.media === media) return Promise.resolve(this.graph);
    if (this.pendingGraph?.media === media) return this.pendingGraph.promise;

    const entry = { media, promise: undefined as unknown as Promise<PlaybackGraph> };
    const promise = createPlaybackGraph(this.graph, media).then(
      (createdGraph) => {
        // Stale creation (stopped or superseded mid-flight) never becomes the
        // active graph; the shared media graph stays cached for later sessions.
        if (this.pendingGraph === entry) {
          this.graph = createdGraph;
          this.pendingGraph = undefined;
        }
        return createdGraph;
      },
      (error: unknown) => {
        if (this.pendingGraph === entry) this.pendingGraph = undefined;
        throw error;
      },
    );
    entry.promise = promise;
    this.pendingGraph = entry;
    return promise;
  }
}

async function createPlaybackGraph(
  existingGraph: PlaybackGraph | undefined,
  media: HTMLMediaElement,
): Promise<PlaybackGraph> {
  existingGraph?.scheduler.stop();
  const shared = await acquireMediaGraph(media);
  // Immediate playback never delays; only the delayed ML mode raises this.
  shared.delay.delayTime.cancelScheduledValues(shared.context.currentTime);
  shared.delay.delayTime.setValueAtTime(0, shared.context.currentTime);
  return {
    context: shared.context,
    media,
    scheduler: new CensorWindowScheduler(shared.context, shared.gain),
  };
}

type PlaybackListeners = {
  reschedule(): void;
  suspend(): void;
  resume(): void;
};

function attachPlaybackListeners(media: HTMLMediaElement, listeners: PlaybackListeners): void {
  media.addEventListener('pause', listeners.reschedule);
  media.addEventListener('ratechange', listeners.reschedule);
  media.addEventListener('waiting', listeners.suspend);
  media.addEventListener('seeking', listeners.suspend);
  media.addEventListener('play', listeners.resume);
  media.addEventListener('playing', listeners.resume);
  media.addEventListener('seeked', listeners.resume);
}

function detachPlaybackListeners(
  media: HTMLMediaElement | undefined,
  listeners: PlaybackListeners,
): void {
  if (!media) return;
  media.removeEventListener('pause', listeners.reschedule);
  media.removeEventListener('ratechange', listeners.reschedule);
  media.removeEventListener('waiting', listeners.suspend);
  media.removeEventListener('seeking', listeners.suspend);
  media.removeEventListener('play', listeners.resume);
  media.removeEventListener('playing', listeners.resume);
  media.removeEventListener('seeked', listeners.resume);
}
