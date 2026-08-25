export type MediaTimelineRange = {
  startTime: number;
  endTime: number;
};

export type BeepCensorExecutor = {
  arm(): Promise<void>;
  execute(range: MediaTimelineRange): Promise<void>;
  stop(): void;
};

export type CensorAudioOptions = { beep?: boolean };

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
  options: CensorAudioOptions = {},
): BeepCensorExecutor {
  const beep = options.beep ?? true;
  let graph: PlaybackGraph | undefined;
  let pendingGraph: { media: HTMLMediaElement; promise: Promise<PlaybackGraph> } | undefined;
  const scheduledRanges = new Set<ScheduledRange>();
  let listeningTo: HTMLMediaElement | undefined;

  const reschedule = () => {
    scheduledRanges.forEach(clearRangeSchedule);
    restoreGain(graph);

    const currentGraph = graph;
    if (!currentGraph || currentGraph.media.paused) {
      return;
    }

    scheduledRanges.forEach((scheduledRange) => scheduleRange(currentGraph, scheduledRange, beep));
  };

  const listenTo = (media: HTMLMediaElement) => {
    if (listeningTo === media) {
      return;
    }

    detachPlaybackListeners(listeningTo, reschedule);
    attachPlaybackListeners(media, reschedule);
    listeningTo = media;
  };

  const ensureGraph = (media: HTMLMediaElement): Promise<PlaybackGraph> => {
    if (graph?.media === media) {
      return Promise.resolve(graph);
    }
    if (pendingGraph?.media === media) {
      return pendingGraph.promise;
    }

    const entry = { media, promise: undefined as unknown as Promise<PlaybackGraph> };
    const promise = createPlaybackGraph(graph, media).then(
      (createdGraph) => {
        if (pendingGraph === entry) {
          graph = createdGraph;
          pendingGraph = undefined;
        } else {
          // Stale creation: stopped or superseded mid-flight. Never let it
          // become the active graph, and release the orphaned AudioContext.
          void createdGraph.context.close().catch(() => undefined);
        }
        return createdGraph;
      },
      (error: unknown) => {
        if (pendingGraph === entry) {
          pendingGraph = undefined;
        }
        throw error;
      },
    );
    entry.promise = promise;
    pendingGraph = entry;
    return promise;
  };

  return {
    async arm() {
      const media = getMedia();
      if (!media) {
        throw new Error('Player media not found');
      }

      const playbackGraph = await ensureGraph(media);
      if (graph !== playbackGraph) {
        // The graph was discarded as stale (stopped mid-arm); nothing to do.
        return;
      }
      listenTo(media);

      if (!media.paused) {
        scheduledRanges.forEach((scheduledRange) =>
          scheduleRange(playbackGraph, scheduledRange, beep),
        );
      }
    },

    async execute(range) {
      const media = getMedia();
      if (!media) {
        throw new Error('Player media not found');
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

        // Without an armed graph the range waits for a user gesture; routing
        // media audio through a suspended AudioContext would silence playback.
        if (graph && !media.paused) {
          scheduleRange(graph, scheduledRange, beep);
        }
      });
    },

    stop() {
      pendingGraph = undefined;
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

async function createPlaybackGraph(
  existingGraph: PlaybackGraph | undefined,
  media: HTMLMediaElement,
): Promise<PlaybackGraph> {
  restoreGain(existingGraph);

  const context = new AudioContext();
  await context.resume();
  if (context.state !== 'running') {
    await context.close().catch(() => undefined);
    throw new Error('AudioContext is blocked until a user gesture');
  }
  const mediaSource = context.createMediaElementSource(media);
  const gain = context.createGain();
  mediaSource.connect(gain);
  gain.connect(context.destination);

  return { context, media, gain, mutedUntil: context.currentTime };
}

function scheduleRange(graph: PlaybackGraph, scheduledRange: ScheduledRange, beep: boolean): void {
  const { media, range } = { media: graph.media, range: scheduledRange.range };
  if (range.endTime <= media.currentTime) {
    completeRange(scheduledRange);
    return;
  }

  const delayMs = Math.max(0, ((range.startTime - media.currentTime) / media.playbackRate) * 1_000);
  scheduledRange.timer = setTimeout(() => {
    startRange(graph, scheduledRange, beep);
  }, delayMs);
}

function startRange(graph: PlaybackGraph, scheduledRange: ScheduledRange, beep: boolean): void {
  const { media, range } = { media: graph.media, range: scheduledRange.range };

  try {
    if (range.endTime <= media.currentTime) {
      completeRange(scheduledRange);
      return;
    }
    if (range.startTime > media.currentTime) {
      scheduleRange(graph, scheduledRange, beep);
      return;
    }

    const durationSeconds = (range.endTime - media.currentTime) / media.playbackRate;
    const startTime = graph.context.currentTime;
    const endTime = startTime + durationSeconds;
    if (beep) {
      const oscillator = graph.context.createOscillator();
      oscillator.frequency.value = 880;
      oscillator.connect(graph.context.destination);
      oscillator.onended = () => completeRange(scheduledRange);
      oscillator.start(startTime);
      oscillator.stop(endTime);
      scheduledRange.oscillator = oscillator;
    } else {
      scheduledRange.timer = setTimeout(
        () => completeRange(scheduledRange),
        durationSeconds * 1_000,
      );
    }

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
