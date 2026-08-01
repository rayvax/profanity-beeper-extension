import { describe, expect, test } from 'bun:test';

import { createCensorLexicon, createCensorRanges, normaliseCensorToken } from './index';

describe('Censor lexicon', () => {
  test('normalises a timed word before matching it', () => {
    expect(normaliseCensorToken('  “ЁЖ!”  ')).toBe('еж');
  });

  test('lets the Whitelist override literal and RegExp rules', () => {
    const lexicon = createCensorLexicon({
      literalWords: ['дурак', 'гадость'],
      patterns: [/^гад/u],
      whitelist: ['гадость'],
    });

    expect(lexicon.matches('дурак')).toBe(true);
    expect(lexicon.matches('гад')).toBe(true);
    expect(lexicon.matches('гадость')).toBe(false);
  });
});

describe('Censor ranges', () => {
  test('selects the entire timed chunk when one of its words matches', () => {
    const lexicon = createCensorLexicon({ literalWords: ['дурак'] });

    expect(
      createCensorRanges({ text: 'Ну и дурак!', startTime: 12.5, endTime: 14 }, lexicon),
    ).toEqual([{ startTime: 12.5, endTime: 14 }]);
  });

  test('does not create a range without a media timeline interval', () => {
    const lexicon = createCensorLexicon({ literalWords: ['дурак'] });

    expect(createCensorRanges({ text: 'дурак' }, lexicon)).toEqual([]);
  });

  test('does not create a range for a non-matching timed chunk', () => {
    const lexicon = createCensorLexicon({ literalWords: ['дурак'] });

    expect(createCensorRanges({ text: 'привет', startTime: 12.5, endTime: 14 }, lexicon)).toEqual(
      [],
    );
  });
});
