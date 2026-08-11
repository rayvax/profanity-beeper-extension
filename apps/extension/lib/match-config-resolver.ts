import type { MatchConfig } from '@beeper/adapter-chrome-sw';

import type { StoragePort } from './chrome-storage';

export type MatchConfigMeta = {
  configSha: string;
};

export type MatchConfigStore = {
  remote: Record<string, MatchConfig>;
  user: Record<string, MatchConfig>;
};

export type MatchConfigResolverDeps = {
  fetch: typeof fetch;
  storage: StoragePort;
  getLanguage: () => string;
  owner?: string;
  repo?: string;
  branch?: string;
  fallbackConfig?: MatchConfig;
};

const DEFAULT_OWNER = 'rayvax';
const DEFAULT_REPO = 'profanity-beeper-extension';
const DEFAULT_BRANCH = 'master';

const STORAGE_META_KEY = 'matchConfigMeta';
const STORAGE_CONFIG_KEY = 'matchConfig';

export class MatchConfigResolver {
  private readonly fetch: typeof fetch;
  private readonly storage: StoragePort;
  private readonly getLanguage: () => string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly fallbackConfig: MatchConfig;

  constructor(deps: MatchConfigResolverDeps) {
    this.fetch = deps.fetch;
    this.storage = deps.storage;
    this.getLanguage = deps.getLanguage;
    this.owner = deps.owner ?? DEFAULT_OWNER;
    this.repo = deps.repo ?? DEFAULT_REPO;
    this.branch = deps.branch ?? DEFAULT_BRANCH;
    this.fallbackConfig = deps.fallbackConfig ?? { patterns: [], terms: [] };
  }

  async refresh(): Promise<void> {
    const stored = (await this.storage.get([STORAGE_META_KEY, STORAGE_CONFIG_KEY])) as {
      matchConfigMeta?: MatchConfigMeta;
      matchConfig?: MatchConfigStore;
    };

    let remoteSha: string | null;
    try {
      remoteSha = await this.fetchConfigPathSha();
    } catch {
      return;
    }

    const cachedSha = stored.matchConfigMeta?.configSha;

    if (remoteSha && cachedSha === remoteSha && stored.matchConfig?.remote) {
      return;
    }

    if (!remoteSha) {
      return;
    }

    const lang = this.resolveLanguageTag(this.getLanguage());
    let config: MatchConfig | null;
    try {
      config = await this.fetchMatchDefaults(lang);
    } catch {
      return;
    }

    if (!config) {
      return;
    }

    const previous = stored.matchConfig ?? { remote: {}, user: {} };
    await this.storage.set({
      [STORAGE_META_KEY]: { configSha: remoteSha },
      [STORAGE_CONFIG_KEY]: {
        remote: { ...previous.remote, [lang]: config },
        user: previous.user ?? {},
      },
    });
  }

  async getEffectiveConfig(): Promise<MatchConfig> {
    const stored = (await this.storage.get([STORAGE_CONFIG_KEY])) as {
      matchConfig?: MatchConfigStore;
    };

    const lang = this.resolveLanguageTag(this.getLanguage());
    const store = stored.matchConfig;

    if (store?.user?.[lang]) {
      return store.user[lang];
    }
    if (store?.remote?.[lang]) {
      return store.remote[lang];
    }
    if (lang !== 'en' && store?.user?.en) {
      return store.user.en;
    }
    if (lang !== 'en' && store?.remote?.en) {
      return store.remote.en;
    }

    return this.fallbackConfig;
  }

  private resolveLanguageTag(locale: string): string {
    const primary = locale.split(/[-_]/)[0]?.toLowerCase();
    return primary || 'en';
  }

  private async fetchConfigPathSha(): Promise<string | null> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/commits?path=config&sha=${this.branch}&per_page=1`;
    const response = await this.fetch(url);
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length === 0) {
      return null;
    }
    const first = body[0];
    if (typeof first !== 'object' || first === null || !('sha' in first)) {
      return null;
    }
    const sha = (first as { sha: unknown }).sha;
    return typeof sha === 'string' ? sha : null;
  }

  private async fetchMatchDefaults(lang: string): Promise<MatchConfig | null> {
    const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/config/match-defaults/${lang}.json`;
    const response = await this.fetch(url);
    if (!response.ok) {
      if (lang !== 'en') {
        return this.fetchMatchDefaults('en');
      }
      return null;
    }
    const body: unknown = await response.json();
    return parseMatchConfig(body);
  }
}

function parseMatchConfig(value: unknown): MatchConfig | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.patterns) || !Array.isArray(record.terms)) {
    return null;
  }
  if (!record.patterns.every((item) => typeof item === 'string')) {
    return null;
  }
  if (!record.terms.every((item) => typeof item === 'string')) {
    return null;
  }
  return {
    patterns: record.patterns as string[],
    terms: record.terms as string[],
  };
}
