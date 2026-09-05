import { PlayerSelector } from './selectors';

export function findPlayerMedia(): HTMLMediaElement | null {
  const media = document.querySelector(PlayerSelector.VIDEO);
  return media instanceof HTMLMediaElement ? media : null;
}
