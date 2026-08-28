import { afterEach, describe, expect, test } from 'bun:test';

import { getVideoIdFromUrl, isWatchPage } from './is-watch-page';

function setLocation(url: string): void {
  window.location.href = url;
}

describe('isWatchPage', () => {
  afterEach(() => {
    setLocation('https://www.youtube.com/watch?v=test123');
  });

  test('returns true on /watch with v query param', () => {
    setLocation('https://www.youtube.com/watch?v=abc123');
    expect(isWatchPage()).toBe(true);
  });

  test('returns false on /watch without v query param', () => {
    setLocation('https://www.youtube.com/watch');
    expect(isWatchPage()).toBe(false);
  });

  test('returns false on non-watch paths', () => {
    setLocation('https://www.youtube.com/');
    expect(isWatchPage()).toBe(false);

    setLocation('https://www.youtube.com/feed/subscriptions');
    expect(isWatchPage()).toBe(false);
  });
});

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
