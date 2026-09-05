const INDICATOR_ATTR = 'data-beeper-indicator';

const SOAP_BAR =
  'M7 9.5h10a4.5 4.5 0 0 1 4.5 4.5v1a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 15v-1A4.5 4.5 0 0 1 7 9.5Z';
const MOUTH = 'M9 12.75h6a1.75 1.75 0 1 1 0 3.5H9a1.75 1.75 0 1 1 0-3.5Z';
const BUBBLES =
  '<circle cx="8" cy="5.2" r="1.6"/><circle cx="12.5" cy="3.4" r="2"/><circle cx="16.8" cy="5.8" r="1.3"/>';
const BUBBLE_PULSE =
  '<animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite"';

const INDICATOR_STATES = {
  loading: {
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${SOAP_BAR}"/><circle cx="8" cy="5.2" r="1.6">${BUBBLE_PULSE} begin="0s"/></circle><circle cx="12.5" cy="3.4" r="2">${BUBBLE_PULSE} begin="0.2s"/></circle><circle cx="16.8" cy="5.8" r="1.3">${BUBBLE_PULSE} begin="0.4s"/></circle></svg>`,
    title: 'Beeper loading captions...',
  },
  working: {
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${SOAP_BAR}"/>${BUBBLES}<path fill="#EE2B2E" d="${MOUTH}"/></svg>`,
    title: 'App is working',
  },
  error: {
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#EE2B2E" stroke-width="1.8" aria-hidden="true"><path d="${SOAP_BAR}"/>${BUBBLES}<g fill="#EE2B2E" stroke="none"><rect x="11.1" y="11.5" width="1.8" height="3.8" rx="0.9"/><circle cx="12" cy="17.3" r="1.1"/></g></svg>`,
    title: 'Beeper failed to bind captions',
  },
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
      'position:absolute;top:16px;right:16px;z-index:9999;color:#fff;opacity:0.85;cursor:default;line-height:0;';

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
    this.element.innerHTML = config.svg;
    this.element.title = config.title;
  }
}
