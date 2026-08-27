import { registerCensorController, registerWordCapturedHandler } from '@beeper/adapter-chrome-sw';
import { chromeMessaging } from '../lib/chrome-messaging';
import { createChromeCensorPorts } from '../lib/chrome-censor-ports';
import { ensureAudio } from '../lib/chrome-offscreen';

export default defineBackground(() => {
  // Listeners must be registered synchronously: a content script message can
  // wake the worker, and events dispatched before registration are lost.
  registerWordCapturedHandler(chromeMessaging);
  const ports = createChromeCensorPorts();
  registerCensorController(chromeMessaging, ports);

  void (async () => {
    try {
      await ensureAudio();
    } catch (error) {
      console.error('[Censor] service worker startup failed', error);
    }
  })();
});
