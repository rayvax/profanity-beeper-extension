import { CensorEffect, type CensorEffectValue } from '@beeper/core';

export function scheduleCensorEffect(
  context: AudioContext,
  effect: CensorEffectValue,
  startTime: number,
  endTime: number,
  activeOscillator?: OscillatorNode,
  onEnded?: () => void,
): OscillatorNode | undefined {
  if (effect === CensorEffect.SILENCE) return undefined;
  if (activeOscillator) {
    activeOscillator.stop(endTime);
    return activeOscillator;
  }

  const oscillator = context.createOscillator();
  oscillator.frequency.value = 880;
  oscillator.connect(context.destination);
  oscillator.onended = onEnded ?? null;
  oscillator.start(startTime);
  oscillator.stop(endTime);
  return oscillator;
}
