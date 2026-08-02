import {
  CensorStatus,
  registerCensorController,
  registerWordCapturedHandler,
} from '@beeper/adapter-chrome-sw';
import { chromeMessaging } from '../lib/chrome-messaging';
import { createChromeCensorPorts } from '../lib/chrome-censor-ports';
import { ensureAudio } from '../lib/chrome-offscreen';

export default defineBackground(async () => {
  await ensureAudio();
  registerWordCapturedHandler(chromeMessaging);
  const ports = createChromeCensorPorts();
  registerCensorController(chromeMessaging, ports);
  const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id === undefined ? [] : [ports.setActionStatus(tab.id, CensorStatus.WAITING)],
    ),
  );
});
