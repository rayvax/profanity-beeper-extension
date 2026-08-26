export type DelayedVideoRenderer = {
  stop(): void;
};

export type DelayedVideoRendererOptions = {
  delaySeconds: number;
  onError(error: unknown): void;
};

type BufferedFrame = {
  capturedAt: number;
  canvas: HTMLCanvasElement;
};

/** Renders video frames behind real time so the canvas matches delayed playback. */
export function createDelayedVideoRenderer(
  video: HTMLVideoElement,
  options: DelayedVideoRendererOptions,
): DelayedVideoRenderer {
  const container = video.parentElement;
  if (!container) throw new Error('Video container not found');

  const canvas = document.createElement('canvas');
  canvas.dataset.beeperDelayedVideo = '';
  // Opaque cover: the video element must stay visible, otherwise Chrome stops
  // presenting frames and requestVideoFrameCallback/drawImage starve.
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;background:#000;';
  container.append(canvas);
  const output = canvas.getContext('2d');
  if (!output) {
    canvas.remove();
    throw new Error('Delayed video canvas is unavailable');
  }

  const frames: BufferedFrame[] = [];
  const pool: HTMLCanvasElement[] = [];
  let running = true;
  let frameRequest: number | undefined;
  let animationRequest: number | undefined;

  const fail = (error: unknown) => {
    if (!running) return;
    stop();
    options.onError(error);
  };

  const capture = () => {
    if (!running) return;
    try {
      if (!video.paused && video.videoWidth > 0 && video.videoHeight > 0) {
        const width = Math.min(video.videoWidth, 1_280);
        const height = Math.round((width * video.videoHeight) / video.videoWidth);
        const frameCanvas = getFrameCanvas(pool, width, height);
        const frameContext = frameCanvas.getContext('2d');
        if (!frameContext) throw new Error('Delayed video frame canvas is unavailable');
        frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        frames.push({ capturedAt: performance.now() / 1_000, canvas: frameCanvas });
      }
      requestFrame();
    } catch (error) {
      fail(error);
    }
  };

  const requestFrame = () => {
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(capture);
    } else {
      frameRequest = window.setTimeout(capture, 33);
    }
  };

  const render = () => {
    if (!running) return;
    try {
      syncCanvasSize(canvas, video);
      const targetTime = performance.now() / 1_000 - options.delaySeconds;
      let frame: BufferedFrame | undefined;
      while (frames[0]?.capturedAt <= targetTime) {
        if (frame) pool.push(frame.canvas);
        frame = frames.shift();
      }
      if (frame) {
        output.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height);
        pool.push(frame.canvas);
      }
      animationRequest = requestAnimationFrame(render);
    } catch (error) {
      fail(error);
    }
  };

  const stop = () => {
    if (!running) return;
    running = false;
    if (frameRequest !== undefined) clearTimeout(frameRequest);
    if (animationRequest !== undefined) cancelAnimationFrame(animationRequest);
    frames.splice(0).forEach((frame) => pool.push(frame.canvas));
    canvas.remove();
  };

  requestFrame();
  animationRequest = requestAnimationFrame(render);
  return { stop };
}

function getFrameCanvas(
  pool: HTMLCanvasElement[],
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = pool.pop() ?? document.createElement('canvas');
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  const width = video.offsetWidth;
  const height = video.offsetHeight;
  if (width === 0 || height === 0) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
