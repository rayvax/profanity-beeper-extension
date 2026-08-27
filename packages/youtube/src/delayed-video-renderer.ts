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
  return new DelayedVideoRendererImpl(video, options);
}

class DelayedVideoRendererImpl implements DelayedVideoRenderer {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly output: CanvasRenderingContext2D;
  private readonly originalContainerPosition: string;
  private readonly originalContainerIsolation: string;
  private readonly originalVideoPosition: string;
  private readonly originalVideoZIndex: string;
  private readonly positionedContainer: boolean;
  private readonly isolatedContainer: boolean;
  private readonly positionedVideo: boolean;
  private readonly frames: BufferedFrame[] = [];
  private readonly pool: HTMLCanvasElement[] = [];
  private running = true;
  private frameRequest: number | undefined;
  private animationRequest: number | undefined;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly options: DelayedVideoRendererOptions,
  ) {
    const container = video.parentElement;
    if (!container) throw new Error('Video container not found');
    this.container = container;
    this.originalContainerPosition = container.style.position;
    this.originalContainerIsolation = container.style.isolation;
    this.originalVideoPosition = video.style.position;
    this.originalVideoZIndex = video.style.zIndex;
    const containerPosition = getComputedStyle(container).position;
    this.positionedContainer = containerPosition === '' || containerPosition === 'static';
    if (this.positionedContainer) container.style.position = 'relative';
    this.isolatedContainer = getComputedStyle(container).isolation !== 'isolate';
    if (this.isolatedContainer) container.style.isolation = 'isolate';
    const videoPosition = getComputedStyle(video).position;
    this.positionedVideo = videoPosition === '' || videoPosition === 'static';
    if (this.positionedVideo) video.style.position = 'relative';
    video.style.zIndex = '0';

    this.canvas = document.createElement('canvas');
    this.canvas.dataset.beeperDelayedVideo = '';
    // Opaque cover: the video element must stay visible, otherwise Chrome stops
    // presenting frames and requestVideoFrameCallback/drawImage starve.
    this.canvas.style.cssText = 'position:absolute;z-index:1;pointer-events:none;background:#000;';
    container.append(this.canvas);
    const output = this.canvas.getContext('2d');
    if (!output) {
      this.canvas.remove();
      this.restoreStyles();
      throw new Error('Delayed video canvas is unavailable');
    }
    this.output = output;

    syncCanvasGeometry(this.canvas, video);
    video.addEventListener('seeking', this.resetTimeline);
    this.requestFrame();
    this.animationRequest = requestAnimationFrame(this.render);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.frameRequest !== undefined) clearTimeout(this.frameRequest);
    if (this.animationRequest !== undefined) cancelAnimationFrame(this.animationRequest);
    this.frames.splice(0).forEach((frame) => this.pool.push(frame.canvas));
    this.video.removeEventListener('seeking', this.resetTimeline);
    this.canvas.remove();
    this.restoreStyles();
  }

  private readonly fail = (error: unknown): void => {
    if (!this.running) return;
    this.stop();
    this.options.onError(error);
  };

  private readonly resetTimeline = (): void => {
    this.frames.splice(0).forEach((frame) => this.pool.push(frame.canvas));
    this.output.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  private readonly capture = (_now?: number, metadata?: VideoFrameCallbackMetadata): void => {
    if (!this.running) return;
    try {
      if (!this.video.paused && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
        const width = Math.min(this.video.videoWidth, 1_280);
        const height = Math.round((width * this.video.videoHeight) / this.video.videoWidth);
        const frameCanvas = getFrameCanvas(this.pool, width, height);
        const frameContext = frameCanvas.getContext('2d');
        if (!frameContext) throw new Error('Delayed video frame canvas is unavailable');
        frameContext.drawImage(this.video, 0, 0, frameCanvas.width, frameCanvas.height);
        this.frames.push({
          mediaTime: metadata?.mediaTime ?? this.video.currentTime,
          canvas: frameCanvas,
        });
      }
      this.requestFrame();
    } catch (error) {
      this.fail(error);
    }
  };

  private requestFrame(): void {
    if ('requestVideoFrameCallback' in this.video) {
      this.video.requestVideoFrameCallback(this.capture);
    } else {
      this.frameRequest = window.setTimeout(this.capture, 33);
    }
  }

  private readonly render = (): void => {
    if (!this.running) return;
    try {
      syncCanvasGeometry(this.canvas, this.video);
      const targetTime =
        this.video.currentTime - this.options.delaySeconds * this.video.playbackRate;
      let frame: BufferedFrame | undefined;
      while (this.frames[0]?.mediaTime <= targetTime) {
        if (frame) this.pool.push(frame.canvas);
        frame = this.frames.shift();
      }
      if (frame) {
        this.output.drawImage(frame.canvas, 0, 0, this.canvas.width, this.canvas.height);
        this.pool.push(frame.canvas);
      }
      this.animationRequest = requestAnimationFrame(this.render);
    } catch (error) {
      this.fail(error);
    }
  };

  private restoreStyles(): void {
    if (this.positionedContainer) this.container.style.position = this.originalContainerPosition;
    if (this.isolatedContainer) this.container.style.isolation = this.originalContainerIsolation;
    if (this.positionedVideo) this.video.style.position = this.originalVideoPosition;
    this.video.style.zIndex = this.originalVideoZIndex;
  }
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
