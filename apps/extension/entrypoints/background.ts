import { registerChunkCapturedHandler } from '@beeper/adapter-chrome-sw';
import { BUNDLED_EN_MATCH_CONFIG } from '../lib/bundled-match-defaults';
import { getUILanguage } from '../lib/chrome-i18n';
import { chromeMessaging } from '../lib/chrome-messaging';
import { ensureAudio } from '../lib/chrome-offscreen';
import { chromeStorage } from '../lib/chrome-storage';
import { MatchConfigResolver } from '../lib/match-config-resolver';

export default defineBackground(async () => {
  await ensureAudio();

  const resolver = new MatchConfigResolver({
    fetch,
    storage: chromeStorage,
    getLanguage: getUILanguage,
    fallbackConfig: BUNDLED_EN_MATCH_CONFIG,
  });

  await resolver.refresh();
  const config = await resolver.getEffectiveConfig();
  registerChunkCapturedHandler(chromeMessaging, config);
});
