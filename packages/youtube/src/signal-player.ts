import { PlayerSelector } from './selectors';
import { findElement } from './shared';

export const signalPlayer = async (signalTimeout = 250): Promise<void> => {
  const playerContainer = await findElement(PlayerSelector.CONTAINER);
  const playerVideo = playerContainer.querySelector(PlayerSelector.VIDEO);
  if (!playerContainer || !playerVideo) {
    return;
  }

  const video = playerVideo as HTMLVideoElement;
  video.muted = true;
  (playerContainer as HTMLElement).style.backgroundColor = 'red';
  setTimeout(() => {
    video.muted = false;
    (playerContainer as HTMLElement).style.backgroundColor = '';
  }, signalTimeout);
};
