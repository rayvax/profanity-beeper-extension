import { createMessaging } from '@beeper/adapter-chrome-sw';

export const chromeMessaging = createMessaging({
  send: (message) => chrome.runtime.sendMessage(message),
  addListener: (listener) => {
    const chromeListener = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => listener(message, sendResponse);
    chrome.runtime.onMessage.addListener(chromeListener);
    return () => chrome.runtime.onMessage.removeListener(chromeListener);
  },
});
