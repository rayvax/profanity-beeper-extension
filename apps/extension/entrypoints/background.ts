import { registerWordCapturedHandler } from '@beeper/adapter-chrome-sw';
import { chromeMessaging } from '../lib/chrome-messaging';
import { ensureAudio } from '../lib/chrome-offscreen';

export default defineBackground(async () => {
  await ensureAudio();
  registerWordCapturedHandler(chromeMessaging);
});
