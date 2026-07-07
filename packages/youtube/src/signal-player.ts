import { PlayerSelector } from './selectors';

function findElement(selector: string, timeout = 300): Promise<Element> {
  const root = document.querySelector(selector);
  if (root) {
    return Promise.resolve(root);
  }

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const found = document.querySelector(selector);
      if (found) {
        clearInterval(interval);
        resolve(found);
      }
    }, timeout);
  });
}

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
