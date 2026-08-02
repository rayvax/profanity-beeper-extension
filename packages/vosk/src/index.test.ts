import { describe, expect, mock, test } from 'bun:test';

import { createVoskSpeechRecognizer } from './index';

class FakeWorker {
  listeners: Array<(event: MessageEvent) => void> = [];
  messages: unknown[] = [];
  postMessage = mock((message: unknown) => this.messages.push(message));
  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.push(listener);
  }
  removeEventListener() {}
  terminate = mock(() => {});
  emit(data: unknown) {
    this.listeners.forEach((listener) => listener(new MessageEvent('message', { data })));
  }
}

describe('Vosk speech recognizer', () => {
  test('preloads locally and forwards only final timed results', async () => {
    const worker = new FakeWorker();
    const recognizer = createVoskSpeechRecognizer({
      modelUrl: '/models/vosk-ru',
      fetch: async () => new Response(new Uint8Array([1, 2, 3])),
      workerFactory: () => worker,
    });
    const preload = recognizer.preload();
    worker.emit({ type: 'ready' });
    await preload;

    const onResult = mock(() => {});
    const media = {} as HTMLMediaElement;
    const session = await recognizer.recognize({ media, onResult, onError: () => {} });
    worker.emit({ type: 'result', final: false, words: [{ text: 'черновик' }] });
    worker.emit({
      type: 'result',
      final: true,
      words: [{ text: 'дурак', startTime: 4, endTime: 5 }],
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({
      final: true,
      words: [{ text: 'дурак', startTime: 4, endTime: 5 }],
    });
    session.stop();
    expect(worker.terminate).toHaveBeenCalled();
  });
});
