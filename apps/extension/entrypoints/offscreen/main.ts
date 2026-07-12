import { registerCensorAudioHandler } from '@beeper/adapter-chrome-sw';
import { chromeMessaging } from '../../lib/chrome-messaging';

registerCensorAudioHandler(chromeMessaging);
