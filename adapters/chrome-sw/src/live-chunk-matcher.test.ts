import { describe, expect, test } from 'bun:test';
import type { MatchConfig } from '@beeper/core';

import { LiveChunkMatcher } from './live-chunk-matcher';
import { MatchConfigResolver } from './match-config-resolver';
import { createMemoryStorage } from './test-helpers';

const cachedRemote: MatchConfig = {
  patterns: ['cached-pattern'],
  terms: ['cached-term'],
};

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LiveChunkMatcher', () => {
  test('picks up reset after storage change', async () => {
    const userConfig: MatchConfig = { patterns: [], terms: ['override-term'] };
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-same' },
      matchConfig: {
        remote: { en: cachedRemote },
        user: { en: userConfig },
      },
    });

    const resolver = new MatchConfigResolver({
      fetch: async () => jsonResponse([{ sha: 'sha-same' }]),
      storage,
      language: 'en',
    });

    const matcher = await LiveChunkMatcher.create(resolver);
    expect(matcher.matches('say override-term now')).toBe(true);

    const stored = (await storage.get(['matchConfig'])) as {
      matchConfig: { remote: Record<string, MatchConfig>; user: Record<string, MatchConfig> };
    };
    delete stored.matchConfig.user.en;
    await storage.set({ matchConfig: stored.matchConfig });
    matcher.scheduleReload();
    await matcher.waitReload();

    expect(matcher.matches('say override-term now')).toBe(false);
    expect(matcher.matches('say cached-term now')).toBe(true);
  });
});
