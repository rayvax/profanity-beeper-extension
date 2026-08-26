import {
  createTimedtextCensorSessionOptions,
  CensorSource,
  CensorStatus,
  createDefaultCensorSettings,
  createMlCensorSessionOptions,
  MessageType,
  startCaptionBeeper,
  type CensorSettings,
} from '@beeper/adapter-chrome-content';
import { chromeMessaging } from '../lib/chrome-messaging';
import { getChromeVoskRecognizer } from '../lib/chrome-vosk-recognizer';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    let session: ReturnType<typeof startCaptionBeeper> | undefined;
    const start = (settings: CensorSettings) => {
      session?.stop();
      if (settings.source === CensorSource.ML) {
        session = startCaptionBeeper(
          chromeMessaging,
          createMlCensorSessionOptions(
            settings,
            {
              workletUrl: chrome.runtime.getURL('audio-worklet.js'),
              recognizer: getChromeVoskRecognizer(),
            },
            sendStatus,
          ),
        );
      } else {
        session = startCaptionBeeper(
          chromeMessaging,
          createTimedtextCensorSessionOptions(settings, sendStatus),
        );
      }
    };
    const sendStatus = (status: 'loading' | 'working' | 'error') => {
      void chromeMessaging.send({
        type: MessageType.CENSOR_STATUS_UPDATED,
        status: status === 'loading' ? CensorStatus.WAITING : status,
      });
    };

    chromeMessaging.on(MessageType.CENSOR_SETTINGS_UPDATED, (message) => start(message.settings));

    let settings = createDefaultCensorSettings();
    try {
      const response = await chromeMessaging.send({ type: MessageType.GET_CENSOR_SETTINGS });
      settings = response.settings;
    } catch (error) {
      console.error('[Caption Beeper] failed to load Censor settings, using defaults', error);
    }
    start(settings);
  },
});
