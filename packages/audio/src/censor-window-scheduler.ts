import { scheduleCensorEffect, type CensorAudioEffectValue } from './censor-effect';

export type CensorAudioWindow = {
  start: number;
  end: number;
};

export type CensorWindowScheduler = {
  replace(windows: CensorAudioWindow[], effect: CensorAudioEffectValue): void;
  stop(): void;
};

const FADE_SECONDS = 0.01;
const DEFAULT_MERGE_GAP_SECONDS = 0.05;

/**
 * Owns the shared audio-side Censor behavior for every Transcript source:
 * merge windows, fade the original audio, and schedule the selected effect.
 */
export function createCensorWindowScheduler(
  context: AudioContext,
  gain: GainNode,
  mergeGapSeconds = DEFAULT_MERGE_GAP_SECONDS,
): CensorWindowScheduler {
  let oscillators: Array<{ window: CensorAudioWindow; node: OscillatorNode }> = [];
  let currentWindows: CensorAudioWindow[] = [];
  let currentEffect: CensorAudioEffectValue | undefined;

  const stopOscillators = (preserve?: OscillatorNode) => {
    oscillators.forEach(({ node }) => {
      if (node === preserve) return;
      node.onended = null;
      try {
        node.stop();
      } catch {
        // The node has already ended.
      }
    });
    oscillators = preserve ? oscillators.filter(({ node }) => node === preserve) : [];
  };

  const replace = (windows: CensorAudioWindow[], effect: CensorAudioEffectValue) => {
    const now = context.currentTime;
    const merged = mergeCensorWindows(
      windows.filter((window) => window.end > now),
      mergeGapSeconds,
    );
    const wasActive = currentWindows.some((window) => window.start <= now && window.end > now);
    const nextActiveWindow = merged.find((window) => window.start <= now && window.end > now);
    const activeOscillator =
      currentEffect === effect
        ? oscillators.find(({ window }) => window.start <= now && window.end > now)?.node
        : undefined;

    stopOscillators(nextActiveWindow ? activeOscillator : undefined);
    gain.gain.cancelScheduledValues(now);
    const active = merged.some((window) => window.start <= now && window.end > now);
    gain.gain.setValueAtTime(active && wasActive ? 0 : 1, now);
    if (active && !wasActive) {
      gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    }

    merged.forEach((window) => {
      const start = Math.max(now, window.start);
      if (window.start > now) {
        gain.gain.setValueAtTime(1, Math.max(now, window.start - FADE_SECONDS));
        gain.gain.linearRampToValueAtTime(0, window.start);
      }
      gain.gain.setValueAtTime(0, window.end);
      gain.gain.linearRampToValueAtTime(1, window.end + FADE_SECONDS);

      if (window === nextActiveWindow && activeOscillator) {
        activeOscillator.stop(window.end);
        oscillators = [{ window, node: activeOscillator }];
        return;
      }

      const oscillator = scheduleCensorEffect(context, effect, start, window.end);
      if (oscillator) oscillators.push({ window, node: oscillator });
    });
    currentWindows = merged;
    currentEffect = effect;
  };

  return {
    replace,
    stop() {
      stopOscillators();
      currentWindows = [];
      currentEffect = undefined;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(1, context.currentTime);
    },
  };
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
