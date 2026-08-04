import type { MatchConfig } from '@beeper/core';

export const staticMatchConfig: MatchConfig = {
  patterns: ['\\[\\s__\\s\\]', '\\[\\u00A0__\\u00A0\\]'],
  terms: [],
};
