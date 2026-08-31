import { afterEach, describe, expect, test } from 'bun:test';

import { getVideoIdFromUrl } from './get-video-id-from-url';

function setLocation(url: string): void {
  window.location.href = url;
}

describe('getVideoIdFromUrl', () => {
  afterEach(() => {
    setLocation('https://www.youtube.com/watch?v=test123');
  });

  test('returns the v query param', () => {
    setLocation('https://www.youtube.com/watch?v=abc123');
    expect(getVideoIdFromUrl()).toBe('abc123');
  });

  test('returns null when v is missing', () => {
    setLocation('https://www.youtube.com/watch');
    expect(getVideoIdFromUrl()).toBeNull();
  });
});
