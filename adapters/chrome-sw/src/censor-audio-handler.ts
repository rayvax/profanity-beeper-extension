import { playBeep } from '@beeper/audio';
import { MessageType, type Messaging } from '@beeper/core';

export function registerCensorAudioHandler(messaging: Messaging): void {
  messaging.on(MessageType.WORD_CENSORED, () => {
    playBeep();
  });
}
