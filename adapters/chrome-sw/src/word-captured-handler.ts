import { MessageType, type Messaging, isTriggerWord } from '@beeper/core';

export function registerWordCapturedHandler(messaging: Messaging): void {
  messaging.on(MessageType.WORD_CAPTURED, (message, reply) => {
    if (!isTriggerWord(message.word)) {
      return reply({ ok: true, censored: false });
    }

    void messaging.send({ type: MessageType.WORD_CENSORED });

    return reply({ ok: true, censored: true });
  });
}
