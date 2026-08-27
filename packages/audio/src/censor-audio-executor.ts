import { CensorAudioEffect, type CensorAudioEffectValue } from './censor-effect';
import {
  createCensorWindowScheduler,
  type CensorAudioWindow,
  type CensorWindowScheduler,
} from './censor-window-scheduler';
import { acquireMediaGraph } from './media-graph';

export type MediaTimelineRange = {
  startTime: number;
  endTime: number;
};

export type CensorAudioExecutor = {
  arm(): Promise<void>;
  execute(range: MediaTimelineRange): Promise<void>;
  updateOptions(options: CensorAudioOptions): void;
  stop(): void;
};

export type CensorAudioOptions = { effect?: CensorAudioEffectValue };

type PlaybackGraph = {
  context: AudioContext;
  media: HTMLMediaElement;
  scheduler: CensorWindowScheduler;
};

type ScheduledRange = {
  range: MediaTimelineRange;
  timer?: ReturnType<typeof setTimeout>;
};

export function createCensorAudioExecutor(
  getMedia: () => HTMLMediaElement | null,
  options: CensorAudioOptions = {},
): CensorAudioExecutor {
  let effect = options.effect ?? CensorAudioEffect.BEEP;
  let graph: PlaybackGraph | undefined;
  let pendingGraph: { media: HTMLMediaElement; promise: Promise<PlaybackGraph> } | undefined;
  const scheduledRanges = new Set<ScheduledRange>();
  let listeningTo: HTMLMediaElement | undefined;
  let generation = 0;
  let waitingForPlayback = false;

  const reschedule = () => {
    scheduledRanges.forEach((scheduledRange) => clearTimeout(scheduledRange.timer));
    const currentGraph = graph;
    if (!currentGraph || currentGraph.media.paused || waitingForPlayback) {
      currentGraph?.scheduler.replace([], effect);
      return;
    }

    const now = currentGraph.context.currentTime;
    const mediaTime = currentGraph.media.currentTime;
    const playbackRate = currentGraph.media.playbackRate;
    const windows: CensorAudioWindow[] = [];

    scheduledRanges.forEach((scheduledRange) => {
      const { range } = scheduledRange;
      if (range.endTime <= mediaTime) {
        scheduledRanges.delete(scheduledRange);
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
          reschedule();
        },
        Math.max(0, ((range.endTime - mediaTime) / playbackRate) * 1_000),
      );
    });

    currentGraph.scheduler.replace(windows, effect);
  };

  const listenTo = (media: HTMLMediaElement) => {
    if (listeningTo === media) return;
    detachPlaybackListeners(listeningTo, playbackListeners);
    waitingForPlayback = false;
    attachPlaybackListeners(media, playbackListeners);
    listeningTo = media;
  };

  const playbackListeners: PlaybackListeners = {
    reschedule,
    suspend() {
      waitingForPlayback = true;
      reschedule();
    },
    resume() {
      waitingForPlayback = false;
      reschedule();
    },
  };

  const ensureGraph = (media: HTMLMediaElement): Promise<PlaybackGraph> => {
    if (graph?.media === media) return Promise.resolve(graph);
    if (pendingGraph?.media === media) return pendingGraph.promise;

    const entry = { media, promise: undefined as unknown as Promise<PlaybackGraph> };
    const promise = createPlaybackGraph(graph, media).then(
      (createdGraph) => {
        // Stale creation (stopped or superseded mid-flight) never becomes the
        // active graph; the shared media graph stays cached for later sessions.
        if (pendingGraph === entry) {
          graph = createdGraph;
          pendingGraph = undefined;
        }
        return createdGraph;
      },
      (error: unknown) => {
        if (pendingGraph === entry) pendingGraph = undefined;
        throw error;
      },
    );
    entry.promise = promise;
    pendingGraph = entry;
    return promise;
  };

  return {
    updateOptions(nextOptions) {
      effect = nextOptions.effect ?? CensorAudioEffect.BEEP;
      reschedule();
    },
    async arm() {
      const media = getMedia();
      if (!media) throw new Error('Player media not found');
      const armGeneration = generation;
      const playbackGraph = await ensureGraph(media);
      // The graph was discarded as stale (stopped mid-arm); nothing to do.
      if (armGeneration !== generation || graph !== playbackGraph) return;
      listenTo(media);
      reschedule();
    },
    async execute(range) {
      const media = getMedia();
      if (!media) throw new Error('Player media not found');
      const executeGeneration = generation;
      const scheduledRange: ScheduledRange = { range };
      scheduledRanges.add(scheduledRange);

      try {
        // Timedtext stays real-time: create its graph when the first range is
        // known. A blocked context rejects below and the session fails open.
        const playbackGraph = await ensureGraph(media);
        if (executeGeneration !== generation || graph !== playbackGraph) {
          throw new Error('Censor executor stopped');
        }
        listenTo(media);
        reschedule();
      } catch (error) {
        scheduledRanges.delete(scheduledRange);
        throw error;
      }
    },
    stop() {
      generation += 1;
      pendingGraph = undefined;
      detachPlaybackListeners(listeningTo, playbackListeners);
      listeningTo = undefined;
      waitingForPlayback = false;
      scheduledRanges.forEach((scheduledRange) => clearTimeout(scheduledRange.timer));
      scheduledRanges.clear();
      graph?.scheduler.stop();
    },
  };
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
    scheduler: createCensorWindowScheduler(shared.context, shared.gain),
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
