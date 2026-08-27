export type DelayedVideoRenderer = {
  stop(): void;
};

export type DelayedVideoRendererOptions = {
  delaySeconds: number;
  onError(error: unknown): void;
};

type BufferedFrame = {
  mediaTime: number;
  canvas: HTMLCanvasElement;
};

/** Renders video frames behind real time so the canvas matches delayed playback. */
export function createDelayedVideoRenderer(
  video: HTMLVideoElement,
  options: DelayedVideoRendererOptions,
): DelayedVideoRenderer {
  const container = video.parentElement;
  if (!container) throw new Error('Video container not found');
  const originalContainerPosition = container.style.position;
  const originalContainerIsolation = container.style.isolation;
  const originalVideoPosition = video.style.position;
  const originalVideoZIndex = video.style.zIndex;
  const containerPosition = getComputedStyle(container).position;
  const positionedContainer = containerPosition === '' || containerPosition === 'static';
  if (positionedContainer) container.style.position = 'relative';
  const isolatedContainer = getComputedStyle(container).isolation !== 'isolate';
  if (isolatedContainer) container.style.isolation = 'isolate';
  const videoPosition = getComputedStyle(video).position;
  const positionedVideo = videoPosition === '' || videoPosition === 'static';
  if (positionedVideo) video.style.position = 'relative';
  video.style.zIndex = '0';

  const canvas = document.createElement('canvas');
  canvas.dataset.beeperDelayedVideo = '';
  // Opaque cover: the video element must stay visible, otherwise Chrome stops
  // presenting frames and requestVideoFrameCallback/drawImage starve.
  canvas.style.cssText = 'position:absolute;z-index:1;pointer-events:none;background:#000;';
  container.append(canvas);
  const output = canvas.getContext('2d');
  if (!output) {
    canvas.remove();
    if (positionedContainer) container.style.position = originalContainerPosition;
    if (isolatedContainer) container.style.isolation = originalContainerIsolation;
    if (positionedVideo) video.style.position = originalVideoPosition;
    video.style.zIndex = originalVideoZIndex;
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

  const capture = (_now?: number, metadata?: VideoFrameCallbackMetadata) => {
    if (!running) return;
    try {
      if (!video.paused && video.videoWidth > 0 && video.videoHeight > 0) {
        const width = Math.min(video.videoWidth, 1_280);
        const height = Math.round((width * video.videoHeight) / video.videoWidth);
        const frameCanvas = getFrameCanvas(pool, width, height);
        const frameContext = frameCanvas.getContext('2d');
        if (!frameContext) throw new Error('Delayed video frame canvas is unavailable');
        frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        frames.push({ mediaTime: metadata?.mediaTime ?? video.currentTime, canvas: frameCanvas });
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
      syncCanvasGeometry(canvas, video);
      const targetTime = video.currentTime - options.delaySeconds * video.playbackRate;
      let frame: BufferedFrame | undefined;
      while (frames[0]?.mediaTime <= targetTime) {
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
    if (positionedContainer) container.style.position = originalContainerPosition;
    if (isolatedContainer) container.style.isolation = originalContainerIsolation;
    if (positionedVideo) video.style.position = originalVideoPosition;
    video.style.zIndex = originalVideoZIndex;
  };

  syncCanvasGeometry(canvas, video);
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

function syncCanvasGeometry(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  canvas.style.width = video.style.width || `${video.offsetWidth}px`;
  canvas.style.height = video.style.height || `${video.offsetHeight}px`;
  canvas.style.left = video.style.left || '0px';
  canvas.style.top = video.style.top || '0px';
  const width = video.offsetWidth;
  const height = video.offsetHeight;
  if (width === 0 || height === 0) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
