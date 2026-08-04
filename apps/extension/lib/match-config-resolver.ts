import { ChunkMatcher, staticMatchConfig, type MatchConfig } from '@beeper/adapter-chrome-sw';

import type { StoragePort } from './chrome-storage';

export type MatchConfigMeta = {
  configSha: string;
};

export type MatchConfigStorage = {
  remote: Record<string, MatchConfig>;
  user?: Record<string, MatchConfig>;
};

export type MatchConfigResolverOptions = {
  fetch: typeof fetch;
  storage: StoragePort;
  getLocale: () => string;
  owner?: string;
  repo?: string;
  branch?: string;
  onStorageChanged?: (listener: () => void) => () => void;
};

const DEFAULT_OWNER = 'rayvax';
const DEFAULT_REPO = 'profanity-beeper-extension';
const DEFAULT_BRANCH = 'master';
const CONFIG_PATH = 'config';

export function isMatchConfig(value: unknown): value is MatchConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as MatchConfig;

  return (
    Array.isArray(candidate.patterns) &&
    candidate.patterns.every((pattern) => typeof pattern === 'string') &&
    Array.isArray(candidate.terms) &&
    candidate.terms.every((term) => typeof term === 'string')
  );
}

function normalizeLanguage(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0] ?? 'en';
}

export class MatchConfigResolver {
  private readonly fetch: typeof fetch;
  private readonly storage: StoragePort;
  private readonly getLocale: () => string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly onStorageChanged?: (listener: () => void) => () => void;
  private config: MatchConfig = staticMatchConfig;
  private cachedStorage: {
    matchConfigMeta?: MatchConfigMeta;
    matchConfig?: MatchConfigStorage;
  } = {};
  private readonly configChangeListeners: Array<() => void> = [];

  constructor(options: MatchConfigResolverOptions) {
    this.fetch = options.fetch;
    this.storage = options.storage;
    this.getLocale = options.getLocale;
    this.owner = options.owner ?? DEFAULT_OWNER;
    this.repo = options.repo ?? DEFAULT_REPO;
    this.branch = options.branch ?? DEFAULT_BRANCH;
    this.onStorageChanged = options.onStorageChanged;
  }

  async start(): Promise<void> {
    await this.syncRemoteIfNeeded();
    this.applyEffectiveConfig();
    this.onStorageChanged?.(() => {
      void this.reloadFromStorage();
    });
  }

  getConfig(): MatchConfig {
    return this.config;
  }

  onConfigChange(listener: () => void): () => void {
    this.configChangeListeners.push(listener);

    return () => {
      const index = this.configChangeListeners.indexOf(listener);
      if (index >= 0) {
        this.configChangeListeners.splice(index, 1);
      }
    };
  }

  private notifyConfigChange(): void {
    for (const listener of this.configChangeListeners) {
      listener();
    }
  }

  private applyEffectiveConfig(): void {
    const nextConfig = this.resolveEffectiveConfig(this.cachedStorage);
    const unchanged = JSON.stringify(nextConfig) === JSON.stringify(this.config);
    if (unchanged) {
      return;
    }

    this.config = nextConfig;
    this.notifyConfigChange();
  }

  async reloadFromStorage(): Promise<void> {
    await this.readStorage();
    this.applyEffectiveConfig();
  }

  private async syncRemoteIfNeeded(): Promise<void> {
    await this.readStorage();

    const remoteSha = await this.fetchConfigDirectorySha();
    const cachedSha = this.cachedStorage.matchConfigMeta?.configSha;

    if (remoteSha && remoteSha === cachedSha) {
      return;
    }

    if (!remoteSha) {
      return;
    }

    try {
      await this.fetchAndCacheRemoteConfig(remoteSha);
      await this.readStorage();
    } catch {
      // Use last cached remote config when GitHub is unreachable.
    }
  }

  private resolveEffectiveConfig(storage: { matchConfig?: MatchConfigStorage }): MatchConfig {
    const lang = normalizeLanguage(this.getLocale());
    const userConfig = storage.matchConfig?.user?.[lang];
    if (userConfig) {
      return userConfig;
    }

    const remoteConfig = storage.matchConfig?.remote?.[lang];
    if (remoteConfig) {
      return remoteConfig;
    }

    const englishRemote = storage.matchConfig?.remote?.en;
    if (englishRemote) {
      return englishRemote;
    }

    return staticMatchConfig;
  }

  private async readStorage(): Promise<void> {
    const stored = await this.storage.get(['matchConfigMeta', 'matchConfig']);

    this.cachedStorage = {
      matchConfigMeta: stored.matchConfigMeta as MatchConfigMeta | undefined,
      matchConfig: stored.matchConfig as MatchConfigStorage | undefined,
    };
  }

  private async fetchConfigDirectorySha(): Promise<string | null> {
    const url = new URL(`https://api.github.com/repos/${this.owner}/${this.repo}/commits`);
    url.searchParams.set('path', CONFIG_PATH);
    url.searchParams.set('sha', this.branch);
    url.searchParams.set('per_page', '1');

    const response = await this.fetch(url.toString());
    if (!response.ok) {
      return null;
    }

    const commits = (await response.json()) as Array<{ sha?: string }>;
    return commits[0]?.sha ?? null;
  }

  private rawConfigUrl(lang: string): string {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/config/match-defaults/${lang}.json`;
  }

  private async fetchRemoteLangConfig(lang: string): Promise<MatchConfig> {
    const primary = await this.tryFetchRemoteLangConfig(lang);
    if (primary) {
      return primary;
    }

    if (lang !== 'en') {
      const english = await this.tryFetchRemoteLangConfig('en');
      if (english) {
        return english;
      }
    }

    throw new Error(`Remote match config unavailable for "${lang}"`);
  }

  private async tryFetchRemoteLangConfig(lang: string): Promise<MatchConfig | null> {
    const response = await this.fetch(this.rawConfigUrl(lang));
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as unknown;
    if (!isMatchConfig(json)) {
      throw new Error(`Invalid match config shape for "${lang}"`);
    }

    return json;
  }

  private async fetchAndCacheRemoteConfig(sha: string): Promise<void> {
    const lang = normalizeLanguage(this.getLocale());
    const config = await this.fetchRemoteLangConfig(lang);
    const remote = {
      ...this.cachedStorage.matchConfig?.remote,
      [lang]: config,
    };

    if (!remote.en) {
      const english = await this.tryFetchRemoteLangConfig('en');
      if (english) {
        remote.en = english;
      }
    }

    await this.storage.set({
      matchConfigMeta: { configSha: sha },
      matchConfig: {
        remote,
        user: this.cachedStorage.matchConfig?.user,
      },
    });
  }
}

export class LiveChunkMatcher {
  private matcher: ChunkMatcher;

  constructor(private readonly resolver: MatchConfigResolver) {
    this.matcher = new ChunkMatcher(resolver.getConfig());
    resolver.onConfigChange(() => {
      this.matcher = new ChunkMatcher(resolver.getConfig());
    });
  }

  matches(text: string): boolean {
    return this.matcher.matches(text);
  }
}
