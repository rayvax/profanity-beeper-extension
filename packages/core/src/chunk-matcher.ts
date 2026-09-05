import type { MatchConfig } from './match-config';

export type ChunkMatcherOptions = {
  terms?: Iterable<string>;
  patterns?: Iterable<string>;
  whitelist?: Iterable<string>;
};

export function normaliseCensorToken(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/^\p{P}+|\p{P}+$/gu, '');
}

/**
 * Classifies transcript text against the active Match config. Blocked terms
 * and user patterns evaluate single Censor tokens; config patterns also test
 * the whole chunk so non-word markers like `[ __ ]` stay detectable. A
 * Whitelisted token is exempt from every rule that targets it.
 */
export class ChunkMatcher {
  private readonly terms: Set<string>;
  private readonly whitelist: Set<string>;
  private readonly patterns: RegExp[] = [];

  constructor(options: ChunkMatcherOptions = {}) {
    this.terms = new Set([...(options.terms ?? [])].map(normaliseCensorToken).filter(Boolean));
    this.whitelist = new Set(
      [...(options.whitelist ?? [])].map(normaliseCensorToken).filter(Boolean),
    );
    for (const pattern of options.patterns ?? []) {
      try {
        this.patterns.push(new RegExp(pattern, 'iu'));
      } catch {
        console.warn(`ChunkMatcher: skipping invalid pattern: ${pattern}`);
      }
    }
  }

  static fromConfig(config: MatchConfig, whitelist?: Iterable<string>): ChunkMatcher {
    return new ChunkMatcher({
      terms: config.terms,
      patterns: config.patterns,
      whitelist,
    });
  }

  matches(value: string): boolean {
    const tokens = value.split(/\s+/u).map(normaliseCensorToken).filter(Boolean);
    const allTokensWhitelisted =
      tokens.length > 0 && tokens.every((token) => this.whitelist.has(token));

    if (!allTokensWhitelisted && this.patterns.some((pattern) => pattern.test(value))) {
      return true;
    }

    return tokens.some((token) => {
      if (this.whitelist.has(token)) {
        return false;
      }
      return this.terms.has(token) || this.patterns.some((pattern) => pattern.test(token));
    });
  }
}
