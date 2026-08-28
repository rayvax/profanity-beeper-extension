import { registerChunkCapturedHandler } from '@beeper/adapter-chrome-sw';
import { BUNDLED_EN_MATCH_CONFIG } from '../lib/bundled-match-defaults';
import { getUILanguage } from '../lib/chrome-i18n';
import { chromeMessaging } from '../lib/chrome-messaging';
import { ensureAudio } from '../lib/chrome-offscreen';
import { chromeStorage, onMatchConfigStorageChanged } from '../lib/chrome-storage';
import { LiveChunkMatcher, MatchConfigResolver } from '../lib/match-config-resolver';

export default defineBackground(async () => {
  await ensureAudio();

  const resolver = new MatchConfigResolver({
    fetch,
    storage: chromeStorage,
    getLanguage: getUILanguage,
    fallbackConfig: BUNDLED_EN_MATCH_CONFIG,
    // Local QA: fetch defaults from test/censor-skill-word (not master) so skill/skills are live.
    branch: 'test/censor-skill-word',
  });

  await resolver.refresh();

  const matcher = await LiveChunkMatcher.create(resolver, onMatchConfigStorageChanged);
  registerChunkCapturedHandler(chromeMessaging, matcher);
});
