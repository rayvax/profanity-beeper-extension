const INDICATOR_ATTR = 'data-beeper-indicator';

const INDICATOR_STATES = {
  loading: { text: '⏳', title: 'Beeper loading captions...' },
  working: { text: '🧼', title: 'App is working' },
  error: { text: '⚠️', title: 'Beeper failed to bind captions' },
} as const;

export type PlayerIndicatorState = keyof typeof INDICATOR_STATES;

export class PlayerIndicator {
  private element: HTMLDivElement | null = null;

  mount(target: Element): void {
    const existing = target.querySelector(`[${INDICATOR_ATTR}]`);
    if (existing instanceof HTMLDivElement) {
      this.element = existing;
      return;
    }

    const indicator = document.createElement('div');
    indicator.setAttribute(INDICATOR_ATTR, '');
    indicator.style.cssText =
      'position:absolute;top:16px;right:16px;z-index:9999;font-size:20px;opacity:0.7;cursor:default;';

    const targetElement = target as HTMLElement;
    if (getComputedStyle(targetElement).position === 'static') {
      targetElement.style.position = 'relative';
    }

    target.appendChild(indicator);
    this.element = indicator;
  }

  unmount(): void {
    this.element?.remove();
    this.element = null;
  }

  setState(state: PlayerIndicatorState): void {
    if (!this.element) {
      return;
    }

    const config = INDICATOR_STATES[state];
    this.element.textContent = config.text;
    this.element.title = config.title;
  }
}
