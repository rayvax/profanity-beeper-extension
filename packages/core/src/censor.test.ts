import { describe, expect, test } from 'bun:test';

import {
  ChunkMatcher,
  createChunkMatcherFromSettings,
  createCensorRanges,
  createDefaultCensorSettings,
  normaliseCensorToken,
} from './index';

describe('Chunk matcher', () => {
  test('ships bundled default Russian terms', () => {
    const matcher = createChunkMatcherFromSettings(createDefaultCensorSettings());

    expect(matcher.matches('Ёбаный')).toBe(true);
    expect(matcher.matches('привет')).toBe(false);
  });

  test('normalises a timed word before matching it', () => {
    expect(normaliseCensorToken('  “ЁЖ!”  ')).toBe('еж');
  });

  test('lets the Whitelist override literal and RegExp rules', () => {
    const matcher = new ChunkMatcher({
      terms: ['дурак', 'гадость'],
      patterns: ['^гад'],
      whitelist: ['гадость'],
    });

    expect(matcher.matches('дурак')).toBe(true);
    expect(matcher.matches('гад')).toBe(true);
    expect(matcher.matches('гадость')).toBe(false);
  });
});

describe('Censor ranges', () => {
  test('selects the entire timed chunk when one of its words matches', () => {
    const matcher = new ChunkMatcher({ terms: ['дурак'] });

    expect(
      createCensorRanges({ text: 'Ну и дурак!', startTime: 12.5, endTime: 14 }, matcher),
    ).toEqual([{ startTime: 12.5, endTime: 14 }]);
  });

  test('marks an ML provisional range so final timing can replace it', () => {
    const matcher = new ChunkMatcher({ terms: ['сука'] });

    expect(
      createCensorRanges({ text: 'Сука!', startTime: 9.4, endTime: 10.06, final: false }, matcher),
    ).toEqual([
      {
        startTime: 9.4,
        endTime: 10.06,
        final: false,
        token: 'сука',
      },
    ]);
  });

  test('does not create a range without a media timeline interval', () => {
    const matcher = new ChunkMatcher({ terms: ['дурак'] });

    expect(createCensorRanges({ text: 'дурак' }, matcher)).toEqual([]);
  });

  test('does not create a range for a non-matching timed chunk', () => {
    const matcher = new ChunkMatcher({ terms: ['дурак'] });

    expect(createCensorRanges({ text: 'привет', startTime: 12.5, endTime: 14 }, matcher)).toEqual(
      [],
    );
  });
});
