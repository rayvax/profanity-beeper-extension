import { MessageType, isTriggerWord } from '@beeper/core';

export function registerWordFoundHandler(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== MessageType.WORD_FOUND) {
      return sendResponse({ ok: false, error: 'Unknown message type' });
    }

    if (!isTriggerWord(message.word)) {
      return sendResponse({ ok: true, beeped: false });
    }

    chrome.runtime.sendMessage({ type: MessageType.PLAY_BEEP })

    return sendResponse({ ok: true, beeped: true });
  });
}
