import { startCensorContentRuntime } from '@beeper/adapter-chrome-content';
import { chromeMessaging } from '../lib/chrome-messaging';
import { getChromeVoskRecognizer } from '../lib/chrome-vosk-recognizer';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    await startCensorContentRuntime(chromeMessaging, {
      workletUrl: chrome.runtime.getURL('audio-worklet.js'),
      recognizer: getChromeVoskRecognizer(),
    });
  },
});
