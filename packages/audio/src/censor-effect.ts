export const CensorAudioEffect = {
  BEEP: 'beep',
  SILENCE: 'silence',
} as const;

export type CensorAudioEffectValue = (typeof CensorAudioEffect)[keyof typeof CensorAudioEffect];

export function scheduleCensorEffect(
  context: AudioContext,
  effect: CensorAudioEffectValue,
  startTime: number,
  endTime: number,
  activeOscillator?: OscillatorNode,
  onEnded?: () => void,
): OscillatorNode | undefined {
  if (effect === CensorAudioEffect.SILENCE) return undefined;
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
