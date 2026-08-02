import { describe, expect, test } from 'bun:test';

import {
  createCensorLexiconFromSettings,
  createDefaultCensorSettings,
  validateCensorSettings,
} from './index';

describe('Censor settings', () => {
  test('uses the documented global defaults', () => {
    expect(createDefaultCensorSettings()).toMatchObject({
      source: 'captions',
      effect: 'beep',
      delaySeconds: 1.2,
      literalAdditions: [],
      patterns: [],
      whitelist: [],
    });
  });

  test('rejects invalid RegExp without producing replacement settings', () => {
    const result = validateCensorSettings({
      ...createDefaultCensorSettings(),
      patterns: ['['],
    });

    expect(result).toEqual({ ok: false, error: 'Invalid RegExp: [' });
  });

  test('lets the Whitelist override default and user Censor rules', () => {
    const lexicon = createCensorLexiconFromSettings({
      ...createDefaultCensorSettings(),
      literalAdditions: ['гадость'],
      patterns: ['^дурак$'],
      whitelist: ['ебаный', 'гадость', 'дурак'],
    });

    expect(lexicon.matches('ебаный')).toBe(false);
    expect(lexicon.matches('гадость')).toBe(false);
    expect(lexicon.matches('дурак')).toBe(false);
  });
});
