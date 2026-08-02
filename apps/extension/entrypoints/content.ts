import {
  createTimedCaptionSessionOptions,
  CensorSource,
  CensorStatus,
  MessageType,
  startCaptionBeeper,
  type CensorSettings,
} from '@beeper/adapter-chrome-content';
import { chromeMessaging } from '../lib/chrome-messaging';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    let session: ReturnType<typeof startCaptionBeeper> | undefined;
    const start = (settings: CensorSettings) => {
      session?.stop();
      if (settings.source === CensorSource.ML) {
        void chromeMessaging.send({
          type: MessageType.CENSOR_STATUS_UPDATED,
          status: CensorStatus.ERROR,
        });
        return;
      }
      session = startCaptionBeeper(
        chromeMessaging,
        createTimedCaptionSessionOptions(settings, (status) => {
          void chromeMessaging.send({
            type: MessageType.CENSOR_STATUS_UPDATED,
            status: status === 'loading' ? CensorStatus.WAITING : status,
          });
        }),
      );
    };

    chromeMessaging.on(MessageType.CENSOR_SETTINGS_UPDATED, (message) => start(message.settings));
    const { settings } = await chromeMessaging.send({ type: MessageType.GET_CENSOR_SETTINGS });
    start(settings);
  },
});
