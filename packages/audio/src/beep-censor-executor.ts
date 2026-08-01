export type MediaTimelineRange = {
  startTime: number;
  endTime: number;
};

export type BeepCensorExecutor = {
  execute(range: MediaTimelineRange): Promise<void>;
  stop(): void;
};

type PlaybackGraph = {
  context: AudioContext;
  media: HTMLMediaElement;
  gain: GainNode;
  mutedUntil: number;
};

type ScheduledRange = {
  range: MediaTimelineRange;
  resolve: () => void;
  reject: (reason: Error) => void;
  remove: () => void;
  timer?: ReturnType<typeof setTimeout>;
  oscillator?: OscillatorNode;
};

export function createBeepCensorExecutor(
  getMedia: () => HTMLMediaElement | null,
): BeepCensorExecutor {
  let graph: PlaybackGraph | undefined;
  const scheduledRanges = new Set<ScheduledRange>();
  let listeningTo: HTMLMediaElement | undefined;

  const reschedule = () => {
    scheduledRanges.forEach(clearRangeSchedule);
    restoreGain(graph);

    const currentGraph = graph;
    if (!currentGraph || currentGraph.media.paused) {
      return;
    }

    scheduledRanges.forEach((scheduledRange) => scheduleRange(currentGraph, scheduledRange));
  };

  return {
    async execute(range) {
      const media = getMedia();
      if (!media) {
        throw new Error('Player media not found');
      }

      const playbackGraph = await getPlaybackGraph(graph, media);
      graph = playbackGraph;
      if (listeningTo !== media) {
        detachPlaybackListeners(listeningTo, reschedule);
        attachPlaybackListeners(media, reschedule);
        listeningTo = media;
      }

      return new Promise<void>((resolve, reject) => {
        let scheduledRange: ScheduledRange;
        scheduledRange = {
          range,
          resolve,
          reject,
          remove: () => scheduledRanges.delete(scheduledRange),
        };
        scheduledRanges.add(scheduledRange);

        if (!media.paused) {
          scheduleRange(playbackGraph, scheduledRange);
        }
      });
    },
    stop() {
      detachPlaybackListeners(listeningTo, reschedule);
      listeningTo = undefined;
      scheduledRanges.forEach((scheduledRange) => {
        clearRangeSchedule(scheduledRange);
        scheduledRange.reject(new Error('Censor executor stopped'));
        scheduledRange.remove();
      });
      scheduledRanges.clear();
      restoreGain(graph);
    },
  };
}

async function getPlaybackGraph(
  existingGraph: PlaybackGraph | undefined,
  media: HTMLMediaElement,
): Promise<PlaybackGraph> {
  if (existingGraph?.media === media) {
    return existingGraph;
  }

  restoreGain(existingGraph);

  const context = new AudioContext();
  await context.resume();
  const mediaSource = context.createMediaElementSource(media);
  const gain = context.createGain();
  mediaSource.connect(gain);
  gain.connect(context.destination);

  return { context, media, gain, mutedUntil: context.currentTime };
}

function scheduleRange(graph: PlaybackGraph, scheduledRange: ScheduledRange): void {
  const { media, range } = { media: graph.media, range: scheduledRange.range };
  if (range.endTime <= media.currentTime) {
    completeRange(scheduledRange);
    return;
  }

  const delayMs = Math.max(0, ((range.startTime - media.currentTime) / media.playbackRate) * 1_000);
  scheduledRange.timer = setTimeout(() => {
    startRange(graph, scheduledRange);
  }, delayMs);
}

function startRange(graph: PlaybackGraph, scheduledRange: ScheduledRange): void {
  const { media, range } = { media: graph.media, range: scheduledRange.range };

  try {
    if (range.endTime <= media.currentTime) {
      completeRange(scheduledRange);
      return;
    }
    if (range.startTime > media.currentTime) {
      scheduleRange(graph, scheduledRange);
      return;
    }

    const durationSeconds = (range.endTime - media.currentTime) / media.playbackRate;
    const oscillator = graph.context.createOscillator();
    const startTime = graph.context.currentTime;
    const endTime = startTime + durationSeconds;
    oscillator.frequency.value = 880;
    oscillator.connect(graph.context.destination);
    oscillator.onended = () => completeRange(scheduledRange);
    oscillator.start(startTime);
    oscillator.stop(endTime);
    scheduledRange.oscillator = oscillator;

    graph.mutedUntil = Math.max(graph.mutedUntil, endTime);
    graph.gain.gain.cancelScheduledValues(startTime);
    graph.gain.gain.setValueAtTime(0, startTime);
    graph.gain.gain.setValueAtTime(1, graph.mutedUntil);
  } catch (error) {
    failRange(scheduledRange, error);
  }
}

function clearRangeSchedule(scheduledRange: ScheduledRange): void {
  clearTimeout(scheduledRange.timer);
  scheduledRange.timer = undefined;
  if (scheduledRange.oscillator) {
    scheduledRange.oscillator.onended = null;
  }
  scheduledRange.oscillator?.stop();
  scheduledRange.oscillator = undefined;
}

function completeRange(scheduledRange: ScheduledRange): void {
  clearRangeSchedule(scheduledRange);
  scheduledRange.remove();
  scheduledRange.resolve();
}

function failRange(scheduledRange: ScheduledRange, error: unknown): void {
  clearRangeSchedule(scheduledRange);
  scheduledRange.remove();
  scheduledRange.reject(error instanceof Error ? error : new Error('Censor playback failed'));
}

function restoreGain(graph: PlaybackGraph | undefined): void {
  if (!graph) {
    return;
  }

  graph.gain.gain.cancelScheduledValues(graph.context.currentTime);
  graph.gain.gain.setValueAtTime(1, graph.context.currentTime);
  graph.mutedUntil = graph.context.currentTime;
}

const PLAYBACK_EVENTS = ['pause', 'play', 'ratechange', 'seeking', 'seeked', 'waiting'] as const;

function attachPlaybackListeners(media: HTMLMediaElement, reschedule: () => void): void {
  PLAYBACK_EVENTS.forEach((eventName) => {
    media.addEventListener(eventName, reschedule);
  });
}

function detachPlaybackListeners(
  media: HTMLMediaElement | undefined,
  reschedule: () => void,
): void {
  if (!media) {
    return;
  }

  PLAYBACK_EVENTS.forEach((eventName) => {
    media.removeEventListener(eventName, reschedule);
  });
}
