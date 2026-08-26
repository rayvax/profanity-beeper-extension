import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { createDelayedVideoRenderer } from './delayed-video-renderer';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalRequestAnimationFrame: typeof requestAnimationFrame;
let originalCancelAnimationFrame: typeof cancelAnimationFrame;

describe('createDelayedVideoRenderer', () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register({ url: 'https://www.youtube.com/watch?v=video' });
    }
  });

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    HTMLCanvasElement.prototype.getContext = mock(() => ({
      drawImage: mock(() => {}),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.requestAnimationFrame = mock(() => 1);
    globalThis.cancelAnimationFrame = mock(() => {});
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    document.body.innerHTML = '';
  });

  test('keeps the source video renderable behind an opaque canvas', () => {
    document.body.innerHTML = '<div id="player"><video style="visibility:visible"></video></div>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      value: mock(() => 1),
    });

    const renderer = createDelayedVideoRenderer(video, {
      delaySeconds: 1.2,
      onError: mock(() => {}),
    });
    const canvas = document.querySelector<HTMLCanvasElement>('[data-beeper-delayed-video]')!;

    expect(video.style.visibility).toBe('visible');
    expect(canvas.style.background).toBe('#000');

    renderer.stop();
    expect(canvas.isConnected).toBeFalse();
    expect(video.style.visibility).toBe('visible');
  });
});
