import type { CensorEffectValue } from '@beeper/core';
import { scheduleCensorEffect } from './censor-effect';

export type CensorAudioWindow = {
  start: number;
  end: number;
};

const FADE_SECONDS = 0.01;
const DEFAULT_MERGE_GAP_SECONDS = 0.05;

/**
 * Owns the shared audio-side Censor behavior for every Transcript source:
 * merge windows, fade the original audio, and schedule the selected effect.
 */
export class CensorWindowScheduler {
  private oscillators: Array<{ window: CensorAudioWindow; node: OscillatorNode }> = [];
  private currentWindows: CensorAudioWindow[] = [];
  private currentEffect: CensorEffectValue | undefined;

  constructor(
    private readonly context: AudioContext,
    private readonly gain: GainNode,
    private readonly mergeGapSeconds = DEFAULT_MERGE_GAP_SECONDS,
  ) {}

  replace(windows: CensorAudioWindow[], effect: CensorEffectValue): void {
    const now = this.context.currentTime;
    const merged = mergeCensorWindows(
      windows.filter((window) => window.end > now),
      this.mergeGapSeconds,
    );
    const wasActive = this.currentWindows.some((window) => window.start <= now && window.end > now);
    const nextActiveWindow = merged.find((window) => window.start <= now && window.end > now);
    const activeOscillator =
      this.currentEffect === effect
        ? this.oscillators.find(({ window }) => window.start <= now && window.end > now)?.node
        : undefined;

    this.stopOscillators(nextActiveWindow ? activeOscillator : undefined);
    this.gain.gain.cancelScheduledValues(now);
    const active = merged.some((window) => window.start <= now && window.end > now);
    this.gain.gain.setValueAtTime(active && wasActive ? 0 : 1, now);
    if (active && !wasActive) {
      this.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    }

    merged.forEach((window) => {
      const start = Math.max(now, window.start);
      if (window.start > now) {
        this.gain.gain.setValueAtTime(1, Math.max(now, window.start - FADE_SECONDS));
        this.gain.gain.linearRampToValueAtTime(0, window.start);
      }
      this.gain.gain.setValueAtTime(0, window.end);
      this.gain.gain.linearRampToValueAtTime(1, window.end + FADE_SECONDS);

      if (window === nextActiveWindow && activeOscillator) {
        activeOscillator.stop(window.end);
        this.oscillators = [{ window, node: activeOscillator }];
        return;
      }

      const oscillator = scheduleCensorEffect(this.context, effect, start, window.end);
      if (oscillator) this.oscillators.push({ window, node: oscillator });
    });
    this.currentWindows = merged;
    this.currentEffect = effect;
  }

  stop(): void {
    this.stopOscillators();
    this.currentWindows = [];
    this.currentEffect = undefined;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(1, this.context.currentTime);
  }

  private stopOscillators(preserve?: OscillatorNode): void {
    this.oscillators.forEach(({ node }) => {
      if (node === preserve) return;
      node.onended = null;
      try {
        node.stop();
      } catch {
        // The node has already ended.
      }
    });
    this.oscillators = preserve ? this.oscillators.filter(({ node }) => node === preserve) : [];
  }
}

export function mergeCensorWindows(
  windows: CensorAudioWindow[],
  mergeGapSeconds = DEFAULT_MERGE_GAP_SECONDS,
): CensorAudioWindow[] {
  return [...windows]
    .sort((left, right) => left.start - right.start)
    .reduce<CensorAudioWindow[]>((merged, window) => {
      const previous = merged.at(-1);
      if (previous && window.start <= previous.end + mergeGapSeconds) {
        previous.end = Math.max(previous.end, window.end);
      } else {
        merged.push({ ...window });
      }
      return merged;
    }, []);
}
