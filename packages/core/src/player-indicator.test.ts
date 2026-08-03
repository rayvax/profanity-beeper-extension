import { beforeEach, describe, expect, test } from 'bun:test';

import { PlayerIndicator } from './player-indicator';

const INDICATOR_SELECTOR = '[data-beeper-indicator]';

describe('PlayerIndicator', () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    target = document.createElement('div');
    target.className = 'html5-video-player';
    document.body.appendChild(target);
  });

  test('mount creates indicator element inside target', () => {
    const indicator = new PlayerIndicator();
    indicator.mount(target);

    const element = target.querySelector(INDICATOR_SELECTOR);
    expect(element).not.toBeNull();
    expect(element?.parentElement).toBe(target);
  });

  test('mount preserves non-static target position', () => {
    target.style.position = 'absolute';
    const indicator = new PlayerIndicator();
    indicator.mount(target);

    expect(target.style.position).toBe('absolute');
  });

  test('mount reuses existing indicator element', () => {
    const existing = document.createElement('div');
    existing.setAttribute('data-beeper-indicator', '');
    target.appendChild(existing);

    const indicator = new PlayerIndicator();
    indicator.mount(target);
    indicator.setState('working');

    expect(target.querySelectorAll(INDICATOR_SELECTOR)).toHaveLength(1);
    expect(existing.textContent).toBe('🧼');
  });

  test('setState updates text and title for each state', () => {
    const indicator = new PlayerIndicator();
    indicator.mount(target);

    indicator.setState('loading');
    let element = target.querySelector(INDICATOR_SELECTOR);
    expect(element?.textContent).toBe('⏳');
    expect(element?.getAttribute('title')).toBe('Beeper loading captions...');

    indicator.setState('working');
    element = target.querySelector(INDICATOR_SELECTOR);
    expect(element?.textContent).toBe('🧼');
    expect(element?.getAttribute('title')).toBe('App is working');

    indicator.setState('error');
    element = target.querySelector(INDICATOR_SELECTOR);
    expect(element?.textContent).toBe('⚠️');
    expect(element?.getAttribute('title')).toBe('Beeper failed to bind captions');
  });

  test('setState is no-op when not mounted', () => {
    const indicator = new PlayerIndicator();
    indicator.setState('working');

    expect(document.querySelector(INDICATOR_SELECTOR)).toBeNull();
  });

  test('unmount removes indicator from DOM', () => {
    const indicator = new PlayerIndicator();
    indicator.mount(target);
    indicator.setState('working');

    indicator.unmount();

    expect(target.querySelector(INDICATOR_SELECTOR)).toBeNull();
  });
});
