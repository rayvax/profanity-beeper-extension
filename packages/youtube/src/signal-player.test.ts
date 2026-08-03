import { beforeEach, describe, expect, test } from 'bun:test';

import { signalPlayer } from './signal-player';

function createPlayerFixture(): { container: HTMLDivElement; video: HTMLVideoElement } {
  const container = document.createElement('div');
  container.className = 'html5-video-player';

  const video = document.createElement('video');
  video.className = 'video-stream';
  video.muted = false;
  container.appendChild(video);
  document.body.appendChild(container);

  return { container, video };
}

describe('signalPlayer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('mutes video and flashes container background', async () => {
    const { container, video } = createPlayerFixture();

    const signalPromise = signalPlayer(50);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(video.muted).toBe(true);
    expect(container.style.backgroundColor).toBe('red');

    await signalPromise;
  });

  test('unmutes video and clears background after timeout', async () => {
    const { container, video } = createPlayerFixture();

    void signalPlayer(30);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(video.muted).toBe(false);
    expect(container.style.backgroundColor).toBe('');
  });

  test('no-op when video element is missing', async () => {
    const container = document.createElement('div');
    container.className = 'html5-video-player';
    document.body.appendChild(container);

    await signalPlayer(30);

    expect(container.style.backgroundColor).toBe('');
  });
});
