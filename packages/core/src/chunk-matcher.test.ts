import { describe, expect, mock, test } from 'bun:test';

import { ChunkMatcher } from './chunk-matcher';
import type { MatchConfig } from './match-config';

const censorTokenConfig: MatchConfig = {
  patterns: ['\\[\\s__\\s\\]'],
  terms: [],
};

const blockedTermConfig: MatchConfig = {
  patterns: [],
  terms: ['bad', 'word'],
};

const fullConfig: MatchConfig = {
  patterns: ['\\[\\s__\\s\\]'],
  terms: ['bad'],
};

describe('ChunkMatcher', () => {
  test.each([
    ['censor token alone', censorTokenConfig, '[ __ ]', true],
    ['censor token embedded', censorTokenConfig, 'word[ __ ]more', true],
    ['nbsp-padded censor token', censorTokenConfig, `[\u00A0__\u00A0]`, true],
    ['normal text', censorTokenConfig, 'hello world', false],
    ['empty text', censorTokenConfig, '', false],
    ['blocked term exact', blockedTermConfig, 'that was bad', true],
    ['blocked term case insensitive', blockedTermConfig, 'BAD', true],
    ['blocked term word boundary', blockedTermConfig, 'badger', false],
    ['blocked term embedded word', blockedTermConfig, 'sword', false],
    ['pattern over term', fullConfig, '[ __ ]', true],
    ['term when no pattern', fullConfig, 'bad', true],
    ['no match in full config', fullConfig, 'hello', false],
  ] as const)('%s', (_label, config, text, expected) => {
    const matcher = new ChunkMatcher(config);
    expect(matcher.matches(text)).toBe(expected);
  });

  test('skips invalid patterns with a warning', () => {
    const warn = mock((_pattern: string, _error: unknown) => {});
    const matcher = new ChunkMatcher({ patterns: ['['], terms: [] }, warn);

    expect(matcher.matches('anything')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe('[');
  });

  test('valid patterns still match when another pattern is invalid', () => {
    const warn = mock((_pattern: string, _error: unknown) => {});
    const matcher = new ChunkMatcher({ patterns: ['[', '\\[\\s__\\s\\]'], terms: [] }, warn);

    expect(matcher.matches('[ __ ]')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
