import { describe, expect, test } from 'bun:test';

import { isTriggerWord, triggerWords } from './trigger-words';

describe('triggerWords', () => {
  test('includes space and nbsp bracket patterns', () => {
    expect(triggerWords).toContain('[ __ ]');
    expect(triggerWords).toContain(`[\u00A0__\u00A0]`);
    expect(triggerWords).toHaveLength(4);
  });
});

describe('isTriggerWord', () => {
  test('matches censored caption token with space padding', () => {
    expect(isTriggerWord('[ __ ]')).toBe(true);
    expect(isTriggerWord('word[ __ ]more')).toBe(true);
  });

  test('matches nbsp-padded censored token', () => {
    expect(isTriggerWord(`[\u00A0__\u00A0]`)).toBe(true);
  });

  test('is case insensitive', () => {
    expect(isTriggerWord('[ __ ]')).toBe(true);
    expect(isTriggerWord('X[ __ ]Y')).toBe(true);
  });

  test('does not match normal words', () => {
    expect(isTriggerWord('hello')).toBe(false);
    expect(isTriggerWord('world')).toBe(false);
    expect(isTriggerWord('')).toBe(false);
  });
});
