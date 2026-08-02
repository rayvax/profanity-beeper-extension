import type {
  SpeechRecognitionOptions,
  SpeechRecognitionSession,
  SpeechRecognizer,
} from '@beeper/speech';

export { createVoskSandboxSpeechRecognizer } from './sandbox-recognizer';
export type { VoskSandboxSpeechRecognizerOptions } from './sandbox-recognizer';

type VoskWorker = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  terminate(): void;
};

export type VoskSpeechRecognizerOptions = {
  modelUrl: string;
  fetch?: typeof globalThis.fetch;
  workerFactory: () => VoskWorker;
};

export function createVoskSpeechRecognizer(options: VoskSpeechRecognizerOptions): SpeechRecognizer {
  const fetchModel = options.fetch ?? globalThis.fetch;
  let model: ArrayBuffer | undefined;

  return {
    preload(signal) {
      if (model) {
        return Promise.resolve();
      }
      return fetchModel(options.modelUrl, { signal }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Vosk model request failed (${response.status})`);
        }
        model = await response.arrayBuffer();
      });
    },
    async recognize(
      recognitionOptions: SpeechRecognitionOptions,
    ): Promise<SpeechRecognitionSession> {
      if (!model) {
        throw new Error('Vosk model is not preloaded');
      }

      const worker = options.workerFactory();
      const onMessage = (event: MessageEvent) => {
        const message = event.data as { type?: string; final?: boolean; words?: unknown };
        if (message.type === 'error') {
          recognitionOptions.onError(message);
        } else if (
          message.type === 'result' &&
          message.final === true &&
          Array.isArray(message.words)
        ) {
          recognitionOptions.onResult({ final: true, words: message.words as never });
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'load', model });
      worker.postMessage({ type: 'start', media: recognitionOptions.media });

      return {
        stop() {
          worker.removeEventListener('message', onMessage);
          worker.postMessage({ type: 'stop' });
          worker.terminate();
        },
      };
    },
  };
}
