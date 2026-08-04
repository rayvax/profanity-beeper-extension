import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { StoragePort } from './chrome-storage';
import { MatchConfigResolver } from './match-config-resolver';

const remoteConfig = {
  patterns: ['\\[\\s__\\s\\]', '\\[\\u00A0__\\u00A0\\]'],
  terms: ['bad'],
};

function createStorage(initial: Record<string, unknown> = {}): StoragePort & {
  data: Record<string, unknown>;
} {
  const data = { ...initial };

  return {
    data,
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

function createFetchMock(handlers: Record<string, () => Response | Promise<Response>>) {
  return mock(async (input: string | URL) => {
    const url = String(input);

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler();
      }
    }

    return new Response(null, { status: 404 });
  });
}

describe('MatchConfigResolver', () => {
  afterEach(() => {
    mock.restore();
  });

  test('skips config refetch when config SHA is unchanged', async () => {
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      'raw.githubusercontent.com': () => new Response(null, { status: 500 }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'en-US',
    });

    await resolver.start();

    expect(
      fetchMock.mock.calls.some(([url]: [string | URL]) => String(url).includes('/commits')),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]: [string | URL]) =>
        String(url).includes('raw.githubusercontent.com'),
      ),
    ).toBe(false);
    expect(resolver.getConfig()).toEqual(remoteConfig);
  });

  test('fetches and caches remote config when SHA changes', async () => {
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-old' },
      matchConfig: { remote: { en: { patterns: [], terms: [] } } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-new' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      'raw.githubusercontent.com': () =>
        new Response(JSON.stringify(remoteConfig), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'en-US',
    });

    await resolver.start();

    expect(storage.data.matchConfigMeta).toEqual({ configSha: 'sha-new' });
    expect((storage.data.matchConfig as { remote: Record<string, unknown> }).remote.en).toEqual(
      remoteConfig,
    );
    expect(resolver.getConfig()).toEqual(remoteConfig);
  });

  test('resolves active language from browser locale primary subtag', async () => {
    const ruConfig = {
      patterns: ['\\[\\s__\\s\\]'],
      terms: ['ru-term'],
    };
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig, ru: ruConfig } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'ru-RU',
    });

    await resolver.start();

    expect(resolver.getConfig()).toEqual(ruConfig);
  });

  test('falls back to en remote config when active language file is missing', async () => {
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'de-DE',
    });

    await resolver.start();

    expect(resolver.getConfig()).toEqual(remoteConfig);
  });

  test('falls back to en when locale has no primary subtag', async () => {
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => '',
    });

    await resolver.start();

    expect(resolver.getConfig()).toEqual(remoteConfig);
  });

  test('prefers user override over remote config for active language', async () => {
    const userOverride = {
      patterns: [],
      terms: ['override'],
    };
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig }, user: { en: userOverride } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'en-US',
    });

    await resolver.start();

    expect(resolver.getConfig()).toEqual(userOverride);
  });

  test('returns to remote defaults after user override reset', async () => {
    const userOverride = {
      patterns: [],
      terms: ['override'],
    };
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig }, user: { en: userOverride } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'en-US',
    });

    await resolver.start();
    expect(resolver.getConfig()).toEqual(userOverride);

    const matchConfig = storage.data.matchConfig as {
      remote: Record<string, unknown>;
      user?: Record<string, unknown>;
    };
    delete matchConfig.user?.en;
    if (matchConfig.user && Object.keys(matchConfig.user).length === 0) {
      delete matchConfig.user;
    }

    await resolver.reloadFromStorage();

    expect(resolver.getConfig()).toEqual(remoteConfig);
  });

  test('reloads effective config when storage listener fires', async () => {
    const userOverride = {
      patterns: [],
      terms: ['override'],
    };
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-1' },
      matchConfig: { remote: { en: remoteConfig }, user: { en: userOverride } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    let storageListener: (() => void) | undefined;

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'en-US',
      onStorageChanged: (listener) => {
        storageListener = listener;
        return () => {
          storageListener = undefined;
        };
      },
    });

    await resolver.start();
    expect(resolver.getConfig()).toEqual(userOverride);

    const matchConfig = storage.data.matchConfig as {
      remote: Record<string, unknown>;
      user?: Record<string, unknown>;
    };
    delete matchConfig.user?.en;
    if (matchConfig.user && Object.keys(matchConfig.user).length === 0) {
      delete matchConfig.user;
    }

    storageListener?.();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(resolver.getConfig()).toEqual(remoteConfig);
  });

  test('falls back to cached remote config when fetch fails', async () => {
    const cachedConfig = {
      patterns: ['\\[\\s__\\s\\]'],
      terms: ['cached'],
    };
    const storage = createStorage({
      matchConfigMeta: { configSha: 'sha-old' },
      matchConfig: { remote: { en: cachedConfig } },
    });
    const fetchMock = createFetchMock({
      '/commits': () =>
        new Response(JSON.stringify([{ sha: 'sha-new' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      'raw.githubusercontent.com': () => new Response(null, { status: 500 }),
    });

    const resolver = new MatchConfigResolver({
      fetch: fetchMock as typeof fetch,
      storage,
      getLocale: () => 'en-US',
    });

    await resolver.start();

    expect(storage.data.matchConfigMeta).toEqual({ configSha: 'sha-old' });
    expect(resolver.getConfig()).toEqual(cachedConfig);
  });
});
