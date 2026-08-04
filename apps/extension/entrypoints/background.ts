import { registerChunkCapturedHandler } from '@beeper/adapter-chrome-sw';
import { chromeMessaging } from '../lib/chrome-messaging';
import { getUILanguage } from '../lib/chrome-i18n';
import { LiveChunkMatcher, MatchConfigResolver } from '../lib/match-config-resolver';
import { chromeStorage, onMatchConfigStorageChanged } from '../lib/chrome-storage';
import { ensureAudio } from '../lib/chrome-offscreen';

export default defineBackground(async () => {
  await ensureAudio();

  const resolver = new MatchConfigResolver({
    fetch,
    storage: chromeStorage,
    getLocale: getUILanguage,
    onStorageChanged: onMatchConfigStorageChanged,
  });

  await resolver.start();

  const matcher = new LiveChunkMatcher(resolver);
  registerChunkCapturedHandler(chromeMessaging, matcher);
});
