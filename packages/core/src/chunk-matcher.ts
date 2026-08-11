import type { MatchConfig } from './match-config';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ChunkMatcher {
  private readonly patterns: RegExp[];
  private readonly terms: RegExp[];

  constructor(config: MatchConfig) {
    this.patterns = [];
    for (const pattern of config.patterns) {
      try {
        this.patterns.push(new RegExp(pattern, 'i'));
      } catch {
        console.warn(`ChunkMatcher: skipping invalid pattern: ${pattern}`);
      }
    }

    this.terms = config.terms.map((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i'));
  }

  matches(text: string): boolean {
    return (
      this.patterns.some((pattern) => pattern.test(text)) ||
      this.terms.some((term) => term.test(text))
    );
  }
}
