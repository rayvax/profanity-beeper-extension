import { afterEach, describe, expect, mock, test } from 'bun:test';

import { ChunkMatcher } from './chunk-matcher';
import type { MatchConfig } from './match-config';

const censorTokenConfig: MatchConfig = {
  patterns: ['\\[(?: |\\u00A0)__(?: |\\u00A0)\\]'],
  terms: [],
};

describe('ChunkMatcher', () => {
  afterEach(() => {
    mock.restore();
  });

  const cases: Array<{
    name: string;
    config: MatchConfig;
    text: string;
    expected: boolean;
  }> = [
    {
      name: 'pattern matches spaced censor token',
      config: censorTokenConfig,
      text: '[ __ ]',
      expected: true,
    },
    {
      name: 'pattern matches nbsp-padded censor token',
      config: censorTokenConfig,
      text: '[\u00A0__\u00A0]',
      expected: true,
    },
    {
      name: 'pattern matches mixed space/nbsp padding',
      config: censorTokenConfig,
      text: '[\u00A0__ ]',
      expected: true,
    },
    {
      name: 'pattern matches censor token embedded in chunk',
      config: censorTokenConfig,
      text: 'word[ __ ]more',
      expected: true,
    },
    {
      name: 'pattern is case insensitive',
      config: { patterns: ['hello'], terms: [] },
      text: 'HELLO world',
      expected: true,
    },
    {
      name: 'blocked term matches whole word',
      config: { patterns: [], terms: ['damn'] },
      text: 'that damn word',
      expected: true,
    },
    {
      name: 'blocked term is case insensitive',
      config: { patterns: [], terms: ['Damn'] },
      text: 'that DAMN word',
      expected: true,
    },
    {
      name: 'blocked term avoids substring false positive',
      config: { patterns: [], terms: ['ass'] },
      text: 'classic',
      expected: false,
    },
    {
      name: 'blocked term matches a token with edge punctuation',
      config: { patterns: [], terms: ['дурак'] },
      text: 'Ну и дурак!',
      expected: true,
    },
    {
      name: 'blocked term folds ё before matching',
      config: { patterns: [], terms: ['ебаный'] },
      text: 'Ёбаный',
      expected: true,
    },
    {
      name: 'no match for clean text',
      config: censorTokenConfig,
      text: 'hello world',
      expected: false,
    },
    {
      name: 'empty text does not match',
      config: censorTokenConfig,
      text: '',
      expected: false,
    },
    {
      name: 'invalid pattern is skipped; valid pattern still matches',
      config: { patterns: ['[invalid', 'bad'], terms: [] },
      text: 'this is bad',
      expected: true,
    },
    {
      name: 'only invalid patterns yields no match',
      config: { patterns: ['[invalid'], terms: [] },
      text: 'anything',
      expected: false,
    },
  ];

  test.each(cases)('$name', ({ config, text, expected }) => {
    const matcher = new ChunkMatcher(config);
    expect(matcher.matches(text)).toBe(expected);
  });

  test('warns and skips invalid patterns at compile time', () => {
    const warn = mock(() => {});
    console.warn = warn;

    const matcher = new ChunkMatcher({ patterns: ['[invalid', 'ok'], terms: [] });

    expect(matcher.matches('ok')).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  test('whitelist exempts a token from terms and patterns', () => {
    const matcher = new ChunkMatcher({
      terms: ['сука'],
      patterns: ['^муд'],
      whitelist: ['сука', 'мудила'],
    });

    expect(matcher.matches('Сука!')).toBe(false);
    expect(matcher.matches('мудак')).toBe(true);
    expect(matcher.matches('мудила')).toBe(false);
  });

  test('whitelist does not suppress a censor-token pattern match', () => {
    const matcher = new ChunkMatcher({
      patterns: censorTokenConfig.patterns,
      terms: [],
      whitelist: ['сука'],
    });

    expect(matcher.matches('[ __ ]')).toBe(true);
  });
});
