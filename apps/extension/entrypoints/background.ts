import {
  LiveChunkMatcher,
  MatchConfigResolver,
  registerChunkCapturedHandler,
} from '@beeper/adapter-chrome-sw';
import { BUNDLED_EN_MATCH_CONFIG } from '../lib/bundled-match-defaults';
import { getUILanguage } from '../lib/chrome-i18n';
import { chromeMessaging } from '../lib/chrome-messaging';
import { ensureAudio } from '../lib/chrome-offscreen';
import { chromeStorage, onMatchConfigStorageChanged } from '../lib/chrome-storage';

export default defineBackground(async () => {
  await ensureAudio();

  const resolver = new MatchConfigResolver({
    fetch,
    storage: chromeStorage,
    language: getUILanguage(),
    fallbackConfig: BUNDLED_EN_MATCH_CONFIG,
  });

  await resolver.refresh();

  const matcher = await LiveChunkMatcher.create(resolver);
  onMatchConfigStorageChanged(() => {
    matcher.scheduleReload();
  });
  registerChunkCapturedHandler(chromeMessaging, matcher);
});
