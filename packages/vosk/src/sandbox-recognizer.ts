import type {
  SpeechRecognitionOptions,
  SpeechRecognitionSession,
  SpeechRecognizer,
  SpeechWord,
} from '@beeper/speech';

type SandboxMessage = {
  source?: string;
  type?: string;
  error?: unknown;
  text?: unknown;
  words?: unknown;
};

export type VoskSandboxSpeechRecognizerOptions = {
  modelUrl: string;
  sandboxUrl: string;
  fetch?: typeof globalThis.fetch;
};

/** Bridges the sandbox-only Vosk runtime to the model-independent contract. */
export function createVoskSandboxSpeechRecognizer(
  options: VoskSandboxSpeechRecognizerOptions,
): SpeechRecognizer {
  return new VoskSandboxSpeechRecognizerImpl(options);
}

class VoskSandboxSpeechRecognizerImpl implements SpeechRecognizer {
  private readonly fetchModel: typeof globalThis.fetch;
  private sandbox: VoskSandbox | undefined;
  private preloadPromise: Promise<void> | undefined;
  private activeRecognition: ActiveRecognition | undefined;

  constructor(private readonly options: VoskSandboxSpeechRecognizerOptions) {
    this.fetchModel = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  preload(signal?: AbortSignal): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;
    const activeSandbox = new VoskSandbox(this.options.sandboxUrl);
    this.sandbox = activeSandbox;
    window.addEventListener('message', this.onMessage);
    this.preloadPromise = activeSandbox.ready
      .then(async () => {
        const response = await this.fetchModel(this.options.modelUrl, { signal });
        if (!response.ok) throw new Error(`Vosk model request failed (${response.status})`);
        const model = await response.arrayBuffer();
        const modelReady = activeSandbox.waitFor('model-ready', 'model-error');
        activeSandbox.post({ target: 'bleep-sandbox', type: 'init', model }, [model]);
        await modelReady;
      })
      .catch((error: unknown) => {
        window.removeEventListener('message', this.onMessage);
        activeSandbox.destroy();
        if (this.sandbox === activeSandbox) this.sandbox = undefined;
        this.preloadPromise = undefined;
        throw error;
      });
    return this.preloadPromise;
  }

  async recognize(recognitionOptions: SpeechRecognitionOptions): Promise<SpeechRecognitionSession> {
    if (!this.sandbox || !this.preloadPromise) throw new Error('Vosk model is not preloaded');
    if (!recognitionOptions.audioInput) {
      throw new Error('Vosk sandbox recognition requires a PCM audio input');
    }
    await this.preloadPromise;
    this.activeRecognition?.stop();
    const active: ActiveRecognition = {
      options: recognitionOptions,
      streamStartTime: recognitionOptions.media.currentTime,
      playbackRate: recognitionOptions.media.playbackRate,
      stop: () => {},
    };
    this.activeRecognition = active;
    let unsubscribe: (() => void) | undefined;
    let stopped = false;
    let sampleRate: number | undefined;
    const stopStream = () => {
      this.sandbox?.post({ target: 'bleep-sandbox', type: 'stop' });
    };
    const restartStream = () => {
      if (stopped || sampleRate === undefined) return;
      stopStream();
      if (recognitionOptions.media.paused) return;
      active.streamStartTime = recognitionOptions.media.currentTime;
      active.playbackRate = recognitionOptions.media.playbackRate;
      this.sandbox?.post({ target: 'bleep-sandbox', type: 'start', sampleRate });
    };
    recognitionOptions.media.addEventListener('seeked', restartStream);
    recognitionOptions.media.addEventListener('ratechange', restartStream);
    recognitionOptions.media.addEventListener('play', restartStream);
    recognitionOptions.media.addEventListener('pause', stopStream);
    void recognitionOptions.audioInput.sampleRate
      .then((resolvedSampleRate) => {
        if (stopped) return;
        sampleRate = resolvedSampleRate;
        restartStream();
        unsubscribe = recognitionOptions.audioInput?.subscribe((pcm) => {
          this.sandbox?.post({ target: 'bleep-sandbox', type: 'audio', pcm }, [pcm]);
        });
      })
      .catch((error: unknown) => {
        if (!stopped) recognitionOptions.onError(error);
      });

    const stop = () => {
      if (stopped) return;
      stopped = true;
      recognitionOptions.media.removeEventListener('seeked', restartStream);
      recognitionOptions.media.removeEventListener('ratechange', restartStream);
      recognitionOptions.media.removeEventListener('play', restartStream);
      recognitionOptions.media.removeEventListener('pause', stopStream);
      unsubscribe?.();
      stopStream();
      if (this.activeRecognition === active) this.activeRecognition = undefined;
    };
    active.stop = stop;
    return { stop };
  }

  private readonly onMessage = (event: MessageEvent<SandboxMessage>) => {
    if (
      !this.sandbox ||
      event.source !== this.sandbox.window ||
      event.data?.source !== 'bleep-sandbox'
    )
      return;
    this.sandbox.receive(event.data);
    if (event.data.type === 'model-error') {
      this.activeRecognition?.options.onError(
        event.data.error ?? new Error('Vosk model failed to load'),
      );
      return;
    }
    if (!this.activeRecognition) return;
    if (event.data.type === 'result' && Array.isArray(event.data.words)) {
      const words = toSpeechWords(
        event.data.words,
        this.activeRecognition.streamStartTime,
        this.activeRecognition.playbackRate,
      );
      if (words.length > 0) this.activeRecognition.options.onResult({ final: true, words });
    }
  };
}

type ActiveRecognition = {
  options: SpeechRecognitionOptions;
  streamStartTime: number;
  playbackRate: number;
  stop(): void;
};

class VoskSandbox {
  readonly ready: Promise<void>;
  readonly window: Window;
  private readonly iframe: HTMLIFrameElement;
  private readonly waiters = new Map<
    string,
    Array<{ resolve(): void; reject(error: unknown): void; errorType?: string }>
  >();
  private readyResolve: () => void = () => {};

  constructor(url: string) {
    this.iframe = document.createElement('iframe');
    this.iframe.src = url;
    this.iframe.style.display = 'none';
    document.documentElement.append(this.iframe);
    if (!this.iframe.contentWindow) throw new Error('Vosk sandbox window is unavailable');
    this.window = this.iframe.contentWindow;
    this.ready = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  post(message: Record<string, unknown>, transfer?: Transferable[]): void {
    this.window.postMessage(message, '*', transfer);
  }

  receive(message: SandboxMessage): void {
    if (message.type === 'ready') this.readyResolve();
    this.waiters
      .get(message.type ?? '')
      ?.splice(0)
      .forEach(({ resolve }) => resolve());
    if (message.type === 'model-error') {
      this.waiters
        .get('model-ready')
        ?.splice(0)
        .forEach(({ reject, errorType }) => {
          if (errorType === 'model-error')
            reject(message.error ?? new Error('Vosk model failed to load'));
        });
    }
  }

  waitFor(type: string, errorType?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiters = this.waiters.get(type) ?? [];
      waiters.push({ resolve, reject, errorType });
      this.waiters.set(type, waiters);
    });
  }

  destroy(): void {
    this.iframe.remove();
  }
}

function toSpeechWords(
  words: unknown[],
  streamStartTime: number,
  playbackRate: number,
): SpeechWord[] {
  return words.flatMap((word) => {
    if (typeof word !== 'object' || word === null) return [];
    const result = word as { word?: unknown; start?: unknown; end?: unknown };
    if (
      typeof result.word !== 'string' ||
      typeof result.start !== 'number' ||
      typeof result.end !== 'number' ||
      !Number.isFinite(result.start) ||
      !Number.isFinite(result.end) ||
      result.end < result.start
    ) {
      return [];
    }
    return [
      {
        text: result.word,
        startTime: streamStartTime + result.start * playbackRate,
        endTime: streamStartTime + result.end * playbackRate,
      },
    ];
  });
}
