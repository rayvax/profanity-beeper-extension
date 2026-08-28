import { describe, expect, test } from 'bun:test';
import type { MatchConfig } from '@beeper/core';

import { MatchConfigResolver } from './match-config-resolver';
import { createMemoryStorage } from './test-helpers';

const cachedRemote: MatchConfig = {
  patterns: ['cached-pattern'],
  terms: ['cached-term'],
};

const fetchedRemote: MatchConfig = {
  patterns: ['fetched-pattern'],
  terms: ['fetched-term'],
};

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MatchConfigResolver', () => {
  test('SHA unchanged skips refetch and keeps cached remote', async () => {
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-same' },
      matchConfig: { remote: { en: cachedRemote }, user: {} },
    });
    const calls: string[] = [];
    const fetchFn = async (input: string) => {
      calls.push(String(input));
      if (String(input).includes('api.github.com')) {
        return jsonResponse([{ sha: 'sha-same' }]);
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    };

    const resolver = new MatchConfigResolver({
      fetch: fetchFn,
      storage,
      language: 'en',
    });

    await resolver.refresh();
    const config = await resolver.getConfig();

    expect(config).toEqual(cachedRemote);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('api.github.com');
  });

  test('SHA changed fetches match defaults and caches remote', async () => {
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-old' },
      matchConfig: { remote: { en: cachedRemote }, user: {} },
    });
    const calls: string[] = [];
    const fetchFn = async (input: string) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.github.com')) {
        return jsonResponse([{ sha: 'sha-new' }]);
      }
      if (url.includes('match-defaults/en.json')) {
        return jsonResponse(fetchedRemote);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const resolver = new MatchConfigResolver({
      fetch: fetchFn,
      storage,
      language: 'en',
    });

    await resolver.refresh();
    const config = await resolver.getConfig();

    expect(config).toEqual(fetchedRemote);
    expect(calls.some((url) => url.includes('match-defaults/en.json'))).toBe(true);

    const stored = (await storage.get(['matchConfigMeta', 'matchConfig'])) as {
      matchConfigMeta?: { configSha: string };
      matchConfig?: { remote: Record<string, MatchConfig> };
    };
    expect(stored.matchConfigMeta?.configSha).toBe('sha-new');
    expect(stored.matchConfig?.remote.en).toEqual(fetchedRemote);
  });

  test('fetch failure falls back to cached remote', async () => {
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-old' },
      matchConfig: { remote: { en: cachedRemote }, user: {} },
    });
    const fetchFn = async (input: string) => {
      const url = String(input);
      if (url.includes('api.github.com')) {
        return jsonResponse([{ sha: 'sha-new' }]);
      }
      if (url.includes('match-defaults/en.json')) {
        return new Response('boom', { status: 500 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const resolver = new MatchConfigResolver({
      fetch: fetchFn,
      storage,
      language: 'en',
    });

    await resolver.refresh();
    const config = await resolver.getConfig();

    expect(config).toEqual(cachedRemote);
  });

  test('user override wins over cached remote', async () => {
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

    await resolver.refresh();
    expect(await resolver.getConfig()).toEqual(userConfig);
  });

  test('missing language falls back to English remote', async () => {
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-same' },
      matchConfig: { remote: { en: cachedRemote }, user: {} },
    });

    const resolver = new MatchConfigResolver({
      fetch: async () => jsonResponse([{ sha: 'sha-same' }]),
      storage,
      language: 'ru-RU',
    });

    await resolver.refresh();
    expect(await resolver.getConfig()).toEqual(cachedRemote);
  });

  test('resolves active language from browser locale primary subtag', async () => {
    const remoteRu: MatchConfig = { patterns: ['ru-pattern'], terms: ['блять'] };
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-same' },
      matchConfig: {
        remote: { en: cachedRemote, ru: remoteRu },
        user: {},
      },
    });

    const resolver = new MatchConfigResolver({
      fetch: async () => jsonResponse([{ sha: 'sha-same' }]),
      storage,
      language: 'ru-RU',
    });

    await resolver.refresh();
    expect(await resolver.getConfig()).toEqual(remoteRu);
  });

  test('falls back to en when locale has no primary subtag', async () => {
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-same' },
      matchConfig: { remote: { en: cachedRemote }, user: {} },
    });

    const resolver = new MatchConfigResolver({
      fetch: async () => jsonResponse([{ sha: 'sha-same' }]),
      storage,
      language: '',
    });

    await resolver.refresh();
    expect(await resolver.getConfig()).toEqual(cachedRemote);
  });

  test('returns to remote defaults after user override reset', async () => {
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
      language: 'en-US',
    });

    await resolver.refresh();
    expect(await resolver.getConfig()).toEqual(userConfig);

    const stored = (await storage.get(['matchConfig'])) as {
      matchConfig: { remote: Record<string, MatchConfig>; user: Record<string, MatchConfig> };
    };
    delete stored.matchConfig.user.en;
    await storage.set({ matchConfig: stored.matchConfig });

    expect(await resolver.getConfig()).toEqual(cachedRemote);
  });
});
