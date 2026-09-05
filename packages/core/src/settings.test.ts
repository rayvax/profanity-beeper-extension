import { describe, expect, test } from 'bun:test';

import {
  createChunkMatcherFromSettings,
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

  test('rejects RegExp rules longer than the validation bound', () => {
    const result = validateCensorSettings({
      ...createDefaultCensorSettings(),
      patterns: ['a'.repeat(257)],
    });

    expect(result).toEqual({
      ok: false,
      error: 'RegExp must not exceed 256 characters',
    });
  });

  test('lets the Whitelist override default and user Censor rules', () => {
    const matcher = createChunkMatcherFromSettings({
      ...createDefaultCensorSettings(),
      literalAdditions: ['гадость'],
      patterns: ['^дурак$'],
      whitelist: ['ебаный', 'гадость', 'дурак'],
    });

    expect(matcher.matches('ебаный')).toBe(false);
    expect(matcher.matches('гадость')).toBe(false);
    expect(matcher.matches('дурак')).toBe(false);
  });

  test('matches the bundled YouTube censor token with default settings', () => {
    const matcher = createChunkMatcherFromSettings(createDefaultCensorSettings());

    expect(matcher.matches('[ __ ]')).toBe(true);
  });
});
