import {
  createTimedCaptionSessionOptions,
  CensorSource,
  CensorStatus,
  createDefaultCensorSettings,
  createMlCensorSessionOptions,
  createVoskSandboxSpeechRecognizer,
  MessageType,
  startCaptionBeeper,
  type CensorSettings,
  type SpeechRecognizer,
} from '@beeper/adapter-chrome-content';
import { chromeMessaging } from '../lib/chrome-messaging';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    let session: ReturnType<typeof startCaptionBeeper> | undefined;
    // One recognizer per page: each instance loads the Vosk model (~44 MB).
    let sharedRecognizer: SpeechRecognizer | undefined;
    const getRecognizer = () => {
      if (sharedRecognizer) return sharedRecognizer;

      sharedRecognizer = createVoskSandboxSpeechRecognizer({
        modelUrl: chrome.runtime.getURL('model/model.tar.gz'),
        sandboxUrl: chrome.runtime.getURL('sandbox.html'),
      });
      // Keep the page-scoped model load independent from a session's abort
      // signal, so a settings rebind cannot cancel the load for its successor.
      void sharedRecognizer.preload().catch(() => undefined);
      return sharedRecognizer;
    };
    const start = (settings: CensorSettings) => {
      session?.stop();
      if (settings.source === CensorSource.ML) {
        session = startCaptionBeeper(
          chromeMessaging,
          createMlCensorSessionOptions(
            settings,
            {
              modelUrl: chrome.runtime.getURL('model/model.tar.gz'),
              sandboxUrl: chrome.runtime.getURL('sandbox.html'),
              workletUrl: chrome.runtime.getURL('audio-worklet.js'),
              recognizer: getRecognizer(),
            },
            sendStatus,
          ),
        );
      } else {
        session = startCaptionBeeper(
          chromeMessaging,
          createTimedCaptionSessionOptions(settings, sendStatus),
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
