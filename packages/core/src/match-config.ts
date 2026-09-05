import enDefaults from '../../../config/match-defaults/en.json';
import ruDefaults from '../../../config/match-defaults/ru.json';

export type MatchConfig = {
  patterns: string[];
  terms: string[];
};

/**
 * Bundled default rules behind every Chunk matcher: the YouTube censor-token
 * pattern plus the default Russian terms. Remote/per-language config refresh
 * is deferred; config/match-defaults remains its storage contract.
 */
export const BUNDLED_MATCH_CONFIG: MatchConfig = {
  patterns: [...(enDefaults as MatchConfig).patterns],
  terms: [...(ruDefaults as MatchConfig).terms],
};
