const INDICATOR_ATTR = 'data-beeper-indicator';

export function mountPlayerIndicator(player: Element): { unmount: () => void } {
  const existing = player.querySelector(`[${INDICATOR_ATTR}]`);
  if (existing) {
    return {
      unmount: () => existing.remove(),
    };
  }

  const indicator = document.createElement('div');
  indicator.setAttribute(INDICATOR_ATTR, '');
  indicator.textContent = '🧼';
  indicator.title = 'App is working';
  indicator.style.cssText =
    'position:absolute;top:16px;right:16px;z-index:9999;font-size:20px;opacity:0.7;cursor:default;';

  const playerElement = player as HTMLElement;
  if (getComputedStyle(playerElement).position === 'static') {
    playerElement.style.position = 'relative';
  }

  player.appendChild(indicator);

  return {
    unmount: () => indicator.remove(),
  };
}
