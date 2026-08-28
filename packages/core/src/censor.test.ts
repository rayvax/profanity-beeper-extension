import { describe, expect, test } from 'bun:test';

import {
  createCensorLexicon,
  createCensorRanges,
  createDefaultRussianCensorLexicon,
  normaliseCensorToken,
} from './index';

describe('Censor lexicon', () => {
  test('ships a default Russian Censor lexicon', () => {
    const lexicon = createDefaultRussianCensorLexicon();

    expect(lexicon.matches('Ёбаный')).toBe(true);
    expect(lexicon.matches('привет')).toBe(false);
  });

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

  test('marks an ML provisional range so final timing can replace it', () => {
    const lexicon = createCensorLexicon({ literalWords: ['сука'] });

    expect(
      createCensorRanges({ text: 'Сука!', startTime: 9.4, endTime: 10.06, final: false }, lexicon),
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
