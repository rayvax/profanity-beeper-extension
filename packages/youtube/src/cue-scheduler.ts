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

export class CueScheduler {
  private readonly cues: TimedTextCue[];
  private readonly getCurrentTimeMs: () => number;
  private readonly isPaused: () => boolean;
  private readonly onChunk: (chunk: CueSchedulerChunk) => void;
  private readonly setTimer: (fn: () => void, delay: number) => CueSchedulerTimerId;
  private readonly clearTimer: (id: CueSchedulerTimerId) => void;

  private destroyed = false;
  private timerId: CueSchedulerTimerId | undefined;
  private lastProcessedMs = -1;
  private nextCueIndex = 0;

  constructor(options: CueSchedulerOptions) {
    this.cues = options.cues;
    this.getCurrentTimeMs = options.getCurrentTimeMs;
    this.isPaused = options.isPaused;
    this.onChunk = options.onChunk;
    this.setTimer =
      options.setTimer ??
      ((fn: () => void, delay: number) => setTimeout(fn, delay) as CueSchedulerTimerId);
    this.clearTimer =
      options.clearTimer ??
      ((id: CueSchedulerTimerId) => {
        clearTimeout(id as ReturnType<typeof setTimeout>);
      });
  }

  start(): void {
    if (this.destroyed) {
      return;
    }

    this.resetPosition();
    if (!this.isPaused()) {
      this.scheduleNext();
    }
  }

  stop(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.clearPendingTimer();
    this.lastProcessedMs = -1;
    this.nextCueIndex = 0;
  }

  onSeek(): void {
    if (this.destroyed) {
      return;
    }

    this.clearPendingTimer();
    this.resetPosition();
    if (!this.isPaused()) {
      this.scheduleNext();
    }
  }

  onPlay(): void {
    if (this.destroyed) {
      return;
    }

    if (!this.isPaused()) {
      this.scheduleNext();
    }
  }

  onPause(): void {
    if (this.destroyed) {
      return;
    }

    this.clearPendingTimer();
  }

  private clearPendingTimer(): void {
    if (this.timerId != null) {
      this.clearTimer(this.timerId);
      this.timerId = undefined;
    }
  }

  private scheduleNext(): void {
    if (this.destroyed) {
      return;
    }

    this.clearPendingTimer();

    const currentTimeMs = this.getCurrentTimeMs();

    while (
      this.nextCueIndex < this.cues.length &&
      this.cues[this.nextCueIndex].startMs <= this.lastProcessedMs
    ) {
      this.nextCueIndex++;
    }

    if (this.nextCueIndex >= this.cues.length) {
      return;
    }

    const cue = this.cues[this.nextCueIndex];
    const delay = cue.startMs - currentTimeMs;

    if (delay <= 0) {
      if (!this.isPaused()) {
        this.onChunk({ text: cue.text });
      }
      this.lastProcessedMs = cue.startMs;
      this.nextCueIndex++;
      this.scheduleNext();
      return;
    }

    this.timerId = this.setTimer(() => {
      this.timerId = undefined;
      if (this.destroyed || this.isPaused()) {
        return;
      }

      this.onChunk({ text: cue.text });
      this.lastProcessedMs = cue.startMs;
      this.nextCueIndex++;
      this.scheduleNext();
    }, delay);
  }

  private resetPosition(): void {
    this.lastProcessedMs = this.getCurrentTimeMs();
    this.nextCueIndex = 0;
  }
}
