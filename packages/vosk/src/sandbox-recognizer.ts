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

const PARTIAL_LOOKBACK_SECONDS = 0.8;
const PARTIAL_LOOKAHEAD_SECONDS = 0.1;

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
    if (!activeRecognition) return;
    if (event.data.type === 'partial' && typeof event.data.text === 'string') {
      const words = toPartialSpeechWords(event.data.text, activeRecognition);
      if (words.length > 0) activeRecognition.options.onResult({ final: false, words });
      return;
    }
    if (event.data.type === 'result' && Array.isArray(event.data.words)) {
      activeRecognition.partialTokens = [];
      const words = toSpeechWords(
        event.data.words,
        activeRecognition.streamStartTime,
        activeRecognition.playbackRate,
      );
      if (words.length > 0) activeRecognition.options.onResult({ final: true, words });
    }
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
        playbackRate: recognitionOptions.media.playbackRate,
        partialTokens: [],
        stop: () => {},
      };
      activeRecognition = active;
      let unsubscribe: (() => void) | undefined;
      let stopped = false;
      let sampleRate: number | undefined;
      const stopStream = () => {
        sandbox?.post({ target: 'bleep-sandbox', type: 'stop' });
      };
      const restartStream = () => {
        if (stopped || sampleRate === undefined) return;
        stopStream();
        if (recognitionOptions.media.paused) return;
        active.streamStartTime = recognitionOptions.media.currentTime;
        active.playbackRate = recognitionOptions.media.playbackRate;
        active.partialTokens = [];
        sandbox?.post({ target: 'bleep-sandbox', type: 'start', sampleRate });
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
            sandbox?.post({ target: 'bleep-sandbox', type: 'audio', pcm }, [pcm]);
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
  playbackRate: number;
  partialTokens: string[];
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

function toPartialSpeechWords(text: string, active: ActiveRecognition): SpeechWord[] {
  const tokens = text.trim().split(/\s+/u).filter(Boolean);
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < tokens.length &&
    tokens[commonPrefixLength] === active.partialTokens[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }
  active.partialTokens = tokens;
  const changedTokens = tokens.slice(commonPrefixLength);
  if (changedTokens.length === 0) return [];

  const playbackRate = active.options.media.playbackRate;
  const currentTime = active.options.media.currentTime;
  const startTime = Math.max(0, currentTime - PARTIAL_LOOKBACK_SECONDS * playbackRate);
  const endTime = currentTime + PARTIAL_LOOKAHEAD_SECONDS * playbackRate;
  return changedTokens.map((token) => ({ text: token, startTime, endTime }));
}
