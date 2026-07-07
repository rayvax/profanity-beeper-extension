import { MessageType } from '@beeper/core';
import { observeCaptions, signalPlayer } from '@beeper/youtube';

const LOG_PREFIX = '[Caption Observer]';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
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
  },
});
