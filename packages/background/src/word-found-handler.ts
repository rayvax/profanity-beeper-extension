import {
  MessageType,
  matchesTriggerWord,
  triggerWords,
} from '@beeper/core';

const LOG_PREFIX = '[Test SW]';

async function playBeep(_word?: string) {
  console.log(`[playBeep]`);
  // await ensureOffscreenDocument();
  // chrome.runtime.sendMessage({ type: MessageType.PLAY_BEEP })
}

export function registerWordFoundHandler(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== MessageType.WORD_FOUND) {
      return sendResponse({ ok: false, error: 'Unknown message type' });
    }

    const caseInsensitiveWord = message.word.toLowerCase();
    console.log(
      `[onMessage] caseInsensitiveWord:`,
      caseInsensitiveWord,
      triggerWords,
      triggerWords.map((word) =>
        caseInsensitiveWord.includes(word.toLowerCase()),
      ),
    );
    if (!matchesTriggerWord(message.word)) {
      return sendResponse({ ok: true, beeped: false });
    }
    playBeep(message.word);
    // playBeep()
    //   .then(() => sendResponse({ ok: true, beeped: true }))
    //   .catch((err) => {
    //     console.error(`${LOG_PREFIX}`, err);
    //     sendResponse({ ok: false, error: String(err) });
    //   });
    // return true;
    return sendResponse({ ok: true, beeped: true });
  });
}
