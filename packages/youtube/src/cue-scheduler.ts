import type { TimedTextCue } from './timed-text-cue';

export type CueSchedulerChunk = {
  text: string;
};

export type CueSchedulerTimerId = unknown;

export type CueSchedulerOptions = {
  cues: TimedTextCue[];
  getCurrentTimeMs: () => number;
  isPaused: () => boolean;
  onChunk: (chunk: CueSchedulerChunk) => void;
  setTimer?: (fn: () => void, delay: number) => CueSchedulerTimerId;
  clearTimer?: (id: CueSchedulerTimerId) => void;
};

export type CueScheduler = {
  start: () => void;
  stop: () => void;
  onSeek: () => void;
  onPlay: () => void;
  onPause: () => void;
};

export function createCueScheduler(options: CueSchedulerOptions): CueScheduler {
  const { cues, getCurrentTimeMs, isPaused, onChunk } = options;
  const setTimer =
    options.setTimer ??
    ((fn: () => void, delay: number) => setTimeout(fn, delay) as CueSchedulerTimerId);
  const clearTimer =
    options.clearTimer ??
    ((id: CueSchedulerTimerId) => {
      clearTimeout(id as ReturnType<typeof setTimeout>);
    });

  let destroyed = false;
  let timerId: CueSchedulerTimerId | undefined;
  let lastProcessedMs = -1;
  let nextCueIndex = 0;

  function clearPendingTimer() {
    if (timerId != null) {
      clearTimer(timerId);
      timerId = undefined;
    }
  }

  function scheduleNext() {
    if (destroyed) {
      return;
    }

    clearPendingTimer();

    const currentTimeMs = getCurrentTimeMs();

    while (nextCueIndex < cues.length && cues[nextCueIndex].startMs <= lastProcessedMs) {
      nextCueIndex++;
    }

    if (nextCueIndex >= cues.length) {
      return;
    }

    const cue = cues[nextCueIndex];
    const delay = cue.startMs - currentTimeMs;

    if (delay <= 0) {
      if (!isPaused()) {
        onChunk({ text: cue.text });
      }
      lastProcessedMs = cue.startMs;
      nextCueIndex++;
      scheduleNext();
      return;
    }

    timerId = setTimer(() => {
      timerId = undefined;
      if (destroyed || isPaused()) {
        return;
      }

      onChunk({ text: cue.text });
      lastProcessedMs = cue.startMs;
      nextCueIndex++;
      scheduleNext();
    }, delay);
  }

  function resetPosition() {
    lastProcessedMs = getCurrentTimeMs();
    nextCueIndex = 0;
  }

  return {
    start: () => {
      if (destroyed) {
        return;
      }

      resetPosition();
      if (!isPaused()) {
        scheduleNext();
      }
    },
    stop: () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      clearPendingTimer();
      lastProcessedMs = -1;
      nextCueIndex = 0;
    },
    onSeek: () => {
      if (destroyed) {
        return;
      }

      clearPendingTimer();
      resetPosition();
      if (!isPaused()) {
        scheduleNext();
      }
    },
    onPlay: () => {
      if (destroyed) {
        return;
      }

      if (!isPaused()) {
        scheduleNext();
      }
    },
    onPause: () => {
      if (destroyed) {
        return;
      }

      clearPendingTimer();
    },
  };
}
