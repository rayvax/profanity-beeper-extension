import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { DelayedVideoRenderer } from './delayed-video-renderer';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalRequestAnimationFrame: typeof requestAnimationFrame;
let originalCancelAnimationFrame: typeof cancelAnimationFrame;

describe('DelayedVideoRenderer', () => {
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
      clearRect: mock(() => {}),
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

  test('keeps the source video renderable below an opaque delayed canvas', () => {
    document.body.innerHTML = '<div id="player"><video style="visibility:visible"></video></div>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      value: mock(() => 1),
    });

    const renderer = new DelayedVideoRenderer(video, {
      delaySeconds: 1.2,
      onError: mock(() => {}),
    });
    const canvas = document.querySelector<HTMLCanvasElement>('[data-beeper-delayed-video]')!;

    expect(video.style.visibility).toBe('visible');
    expect(video.parentElement?.style.position).toBe('relative');
    expect(video.parentElement?.style.isolation).toBe('isolate');
    expect(video.style.position).toBe('relative');
    expect(video.style.zIndex).toBe('0');
    expect(canvas.style.zIndex).toBe('1');
    expect(canvas.style.background).toBe('#000');

    renderer.stop();
    expect(canvas.isConnected).toBeFalse();
    expect(video.style.visibility).toBe('visible');
    expect(video.parentElement?.style.position).toBe('');
    expect(video.parentElement?.style.isolation).toBe('');
    expect(video.style.position).toBe('');
    expect(video.style.zIndex).toBe('');
  });

  test('selects the delayed frame on the media timeline', () => {
    document.body.innerHTML = '<div><video></video></div>';
    const video = document.querySelector('video')!;
    let capture: ((now: number, metadata: VideoFrameCallbackMetadata) => void) | undefined;
    let render: FrameRequestCallback | undefined;
    const drawImage = mock(() => {});
    HTMLCanvasElement.prototype.getContext = mock(() => ({
      drawImage,
      clearRect: mock(() => {}),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.requestAnimationFrame = mock((callback) => {
      render = callback;
      return 1;
    });
    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 10, writable: true },
      paused: { configurable: true, value: false },
      playbackRate: { configurable: true, value: 1 },
      videoWidth: { configurable: true, value: 320 },
      videoHeight: { configurable: true, value: 180 },
      requestVideoFrameCallback: {
        configurable: true,
        value: mock((callback) => {
          capture = callback;
          return 1;
        }),
      },
    });

    const renderer = new DelayedVideoRenderer(video, {
      delaySeconds: 2,
      onError: mock(() => {}),
    });
    capture?.(0, { mediaTime: 10 } as VideoFrameCallbackMetadata);
    video.currentTime = 12;
    render?.(0);

    expect(drawImage).toHaveBeenCalledTimes(2);
    renderer.stop();
  });

  test('matches the delayed canvas geometry to the source video', () => {
    document.body.innerHTML =
      '<div><video style="width:960px;height:540px;left:80px;top:45px"></video></div>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      value: mock(() => 1),
    });

    const renderer = new DelayedVideoRenderer(video, {
      delaySeconds: 1.2,
      onError: mock(() => {}),
    });
    const canvas = document.querySelector<HTMLCanvasElement>('[data-beeper-delayed-video]')!;

    expect(canvas.style.width).toBe('960px');
    expect(canvas.style.height).toBe('540px');
    expect(canvas.style.left).toBe('80px');
    expect(canvas.style.top).toBe('45px');

    renderer.stop();
  });

  test('drops frames from the old timeline after seeking backwards', () => {
    document.body.innerHTML = '<div><video></video></div>';
    const video = document.querySelector('video')!;
    let capture: ((now: number, metadata: VideoFrameCallbackMetadata) => void) | undefined;
    let render: FrameRequestCallback | undefined;
    const drawImage = mock(() => {});
    HTMLCanvasElement.prototype.getContext = mock(() => ({
      drawImage,
      clearRect: mock(() => {}),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.requestAnimationFrame = mock((callback) => {
      render = callback;
      return 1;
    });
    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 20, writable: true },
      paused: { configurable: true, value: false },
      playbackRate: { configurable: true, value: 1 },
      videoWidth: { configurable: true, value: 320 },
      videoHeight: { configurable: true, value: 180 },
      requestVideoFrameCallback: {
        configurable: true,
        value: mock((callback) => {
          capture = callback;
          return 1;
        }),
      },
    });

    const renderer = new DelayedVideoRenderer(video, {
      delaySeconds: 2,
      onError: mock(() => {}),
    });
    capture?.(0, { mediaTime: 20 } as VideoFrameCallbackMetadata);
    video.currentTime = 5;
    video.dispatchEvent(new Event('seeking'));
    capture?.(0, { mediaTime: 5 } as VideoFrameCallbackMetadata);
    video.currentTime = 7;
    render?.(0);

    expect(drawImage).toHaveBeenCalledTimes(3);
    renderer.stop();
  });
});
