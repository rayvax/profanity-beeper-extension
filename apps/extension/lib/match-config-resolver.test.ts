import { describe, expect, test } from 'bun:test';
import type { MatchConfig } from '@beeper/adapter-chrome-sw';

import type { StoragePort } from './chrome-storage';
import { MatchConfigResolver } from './match-config-resolver';

const cachedRemote: MatchConfig = {
  patterns: ['cached-pattern'],
  terms: ['cached-term'],
};

const fetchedRemote: MatchConfig = {
  patterns: ['fetched-pattern'],
  terms: ['fetched-term'],
};

function createMemoryStorage(initial: Record<string, unknown> = {}): StoragePort {
  const data = { ...initial };

  return {
    get: async (keys) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in data) {
          result[key] = data[key];
        }
      }
      return result;
    },
    set: async (items) => {
      Object.assign(data, items);
    },
  };
}

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
    const fetchFn: typeof fetch = async (input) => {
      calls.push(String(input));
      if (String(input).includes('api.github.com')) {
        return jsonResponse([{ sha: 'sha-same' }]);
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    };

    const resolver = new MatchConfigResolver({
      fetch: fetchFn,
      storage,
      getLanguage: () => 'en',
    });

    await resolver.refresh();
    const config = await resolver.getEffectiveConfig();

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
    const fetchFn: typeof fetch = async (input) => {
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
      getLanguage: () => 'en',
    });

    await resolver.refresh();
    const config = await resolver.getEffectiveConfig();

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
    const fetchFn: typeof fetch = async (input) => {
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
      getLanguage: () => 'en',
    });

    await resolver.refresh();
    const config = await resolver.getEffectiveConfig();

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
      getLanguage: () => 'en',
    });

    await resolver.refresh();
    expect(await resolver.getEffectiveConfig()).toEqual(userConfig);
  });

  test('missing language falls back to English remote', async () => {
    const storage = createMemoryStorage({
      matchConfigMeta: { configSha: 'sha-same' },
      matchConfig: { remote: { en: cachedRemote }, user: {} },
    });

    const resolver = new MatchConfigResolver({
      fetch: async () => jsonResponse([{ sha: 'sha-same' }]),
      storage,
      getLanguage: () => 'ru-RU',
    });

    await resolver.refresh();
    expect(await resolver.getEffectiveConfig()).toEqual(cachedRemote);
  });
});
