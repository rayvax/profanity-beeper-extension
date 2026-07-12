import { MessageType, type Messaging } from '@beeper/core';
import { observeCaptions, signalPlayer } from '@beeper/youtube';

const LOG_PREFIX = '[Caption Observer]';

export function startCaptionBeeper(messaging: Messaging): void {
  console.info(`${LOG_PREFIX} injected at`, location.href);

  observeCaptions((text) => {
    void (async () => {
      const response = await messaging.send({
        type: MessageType.WORD_CAPTURED,
        word: text,
      });

      if (response.ok && response.censored) {
        signalPlayer();
      }
    })();
  });
}
