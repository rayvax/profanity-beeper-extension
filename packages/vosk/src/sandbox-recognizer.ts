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
  const fetchModel = options.fetch ?? globalThis.fetch;
  let sandbox: VoskSandbox | undefined;
  let preloadPromise: Promise<void> | undefined;
  let activeRecognition: ActiveRecognition | undefined;

  const onMessage = (event: MessageEvent<SandboxMessage>) => {
    if (!sandbox || event.source !== sandbox.window || event.data?.source !== 'bleep-sandbox')
      return;
    sandbox.receive(event.data);
    if (event.data.type === 'model-error') {
      activeRecognition?.options.onError(
        event.data.error ?? new Error('Vosk model failed to load'),
      );
      return;
    }
    if (event.data.type !== 'result' || !activeRecognition || !Array.isArray(event.data.words))
      return;
    const words = toSpeechWords(event.data.words, activeRecognition.streamStartTime);
    if (words.length > 0) activeRecognition.options.onResult({ final: true, words });
  };

  return {
    preload(signal) {
      if (preloadPromise) return preloadPromise;
      const activeSandbox = new VoskSandbox(options.sandboxUrl);
      sandbox = activeSandbox;
      window.addEventListener('message', onMessage);
      preloadPromise = activeSandbox.ready
        .then(async () => {
          const response = await fetchModel(options.modelUrl, { signal });
          if (!response.ok) throw new Error(`Vosk model request failed (${response.status})`);
          const model = await response.arrayBuffer();
          const modelReady = activeSandbox.waitFor('model-ready', 'model-error');
          activeSandbox.post({ target: 'bleep-sandbox', type: 'init', model }, [model]);
          await modelReady;
        })
        .catch((error: unknown) => {
          window.removeEventListener('message', onMessage);
          activeSandbox.destroy();
          if (sandbox === activeSandbox) sandbox = undefined;
          preloadPromise = undefined;
          throw error;
        });
      return preloadPromise;
    },
    async recognize(
      recognitionOptions: SpeechRecognitionOptions,
    ): Promise<SpeechRecognitionSession> {
      if (!sandbox || !preloadPromise) throw new Error('Vosk model is not preloaded');
      if (!recognitionOptions.audioInput) {
        throw new Error('Vosk sandbox recognition requires a PCM audio input');
      }
      await preloadPromise;
      activeRecognition?.stop();
      const active: ActiveRecognition = {
        options: recognitionOptions,
        streamStartTime: recognitionOptions.media.currentTime,
        stop: () => {},
      };
      activeRecognition = active;
      let unsubscribe: (() => void) | undefined;
      let stopped = false;
      void recognitionOptions.audioInput.sampleRate
        .then((sampleRate) => {
          if (stopped) return;
          active.streamStartTime = recognitionOptions.media.currentTime;
          sandbox?.post({ target: 'bleep-sandbox', type: 'start', sampleRate });
          unsubscribe = recognitionOptions.audioInput?.subscribe((pcm) => {
            sandbox?.post({ target: 'bleep-sandbox', type: 'audio', pcm }, [pcm]);
          });
        })
        .catch((error: unknown) => {
          if (!stopped) recognitionOptions.onError(error);
        });

      const stop = () => {
        if (stopped) return;
        stopped = true;
        unsubscribe?.();
        sandbox?.post({ target: 'bleep-sandbox', type: 'stop' });
        if (activeRecognition === active) activeRecognition = undefined;
      };
      active.stop = stop;
      return { stop };
    },
  };
}

type ActiveRecognition = {
  options: SpeechRecognitionOptions;
  streamStartTime: number;
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

function toSpeechWords(words: unknown[], streamStartTime: number): SpeechWord[] {
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
        startTime: streamStartTime + result.start,
        endTime: streamStartTime + result.end,
      },
    ];
  });
}
