import { MessageType } from '@beeper/core';
import { observeCaptions, signalPlayer } from '@beeper/youtube';

const LOG_PREFIX = '[Caption Observer]';

export function startCaptionBeeper(): void {
  console.info(`${LOG_PREFIX} injected at`, location.href);

  observeCaptions((text) => {
    chrome.runtime.sendMessage(
      { type: MessageType.WORD_FOUND, word: text },
      (response) => {
        if (!response?.ok) {
          return;
        }

        if (response?.beeped) {
          signalPlayer();
        }
      },
    );
  });
}
