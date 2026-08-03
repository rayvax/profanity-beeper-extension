import type { MatchConfig } from './match-config';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ChunkMatcher {
  private readonly patternRegexes: RegExp[];
  private readonly termRegexes: RegExp[];

  constructor(
    config: MatchConfig,
    onInvalidPattern: (pattern: string, error: unknown) => void = (pattern, error) => {
      console.warn(`[ChunkMatcher] Skipping invalid pattern "${pattern}":`, error);
    },
  ) {
    this.patternRegexes = config.patterns.flatMap((pattern) => {
      try {
        return [new RegExp(pattern, 'i')];
      } catch (error) {
        onInvalidPattern(pattern, error);
        return [];
      }
    });

    this.termRegexes = config.terms.map((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i'));
  }

  matches(text: string): boolean {
    if (this.patternRegexes.some((regex) => regex.test(text))) {
      return true;
    }

    return this.termRegexes.some((regex) => regex.test(text));
  }
}
