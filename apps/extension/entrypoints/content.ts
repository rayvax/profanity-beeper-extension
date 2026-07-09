import { startCaptionBeeper } from '@beeper/adapter-chrome-content';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    startCaptionBeeper();
  },
});
