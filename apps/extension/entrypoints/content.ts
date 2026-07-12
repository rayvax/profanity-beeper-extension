import { startCaptionBeeper } from '@beeper/adapter-chrome-content';
import { chromeMessaging } from '../lib/chrome-messaging';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    startCaptionBeeper(chromeMessaging);
  },
});
