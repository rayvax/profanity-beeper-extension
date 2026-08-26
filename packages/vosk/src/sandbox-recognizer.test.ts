import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { createVoskSandboxSpeechRecognizer } from './sandbox-recognizer';

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function emitSandboxMessage(iframe: HTMLIFrameElement, data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      source: iframe.contentWindow,
    }),
  );
}

async function preloadRecognizer() {
  const fetchModel = mock(async () => new Response(new Uint8Array([1, 2, 3])));
  const recognizer = createVoskSandboxSpeechRecognizer({
    modelUrl: 'chrome-extension://test/model.tar.gz',
    sandboxUrl: 'about:blank',
    fetch: fetchModel,
  });
  const preload = recognizer.preload();
  const iframe = document.querySelector('iframe')!;
  const postMessage = mock(() => {});
  iframe.contentWindow!.postMessage = postMessage;

  emitSandboxMessage(iframe, { source: 'bleep-sandbox', type: 'ready' });
  await flushMicrotasks();
  emitSandboxMessage(iframe, { source: 'bleep-sandbox', type: 'model-ready' });
  await preload;
  return { fetchModel, iframe, postMessage, recognizer };
}

describe('Vosk sandbox speech recognizer', () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register({ url: 'https://www.youtube.com/watch?v=video' });
    }
  });

  afterEach(() => {
    document.querySelectorAll('iframe').forEach((iframe) => iframe.remove());
  });

  test('loads one local model and emits only final media-timeline words', async () => {
    const { fetchModel, iframe, postMessage, recognizer } = await preloadRecognizer();
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      paused: false,
      playbackRate: 2,
    }) as HTMLMediaElement;
    const onResult = mock(() => {});
    const subscribe = mock(() => () => {});

    const session = await recognizer.recognize({
      media,
      audioInput: { sampleRate: Promise.resolve(48_000), subscribe },
      onResult,
      onError: mock(() => {}),
    });
    await flushMicrotasks();

    emitSandboxMessage(iframe, {
      source: 'bleep-sandbox',
      type: 'partial',
      words: [{ word: 'черновик', start: 0, end: 1 }],
    });
    emitSandboxMessage(iframe, {
      source: 'bleep-sandbox',
      type: 'result',
      words: [{ word: 'дурак', start: 1, end: 2 }],
    });

    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({
      final: true,
      words: [{ text: 'дурак', startTime: 12, endTime: 14 }],
    });

    media.currentTime = 50;
    media.playbackRate = 1;
    media.dispatchEvent(new Event('seeked'));
    emitSandboxMessage(iframe, {
      source: 'bleep-sandbox',
      type: 'result',
      words: [{ word: 'сука', start: 1, end: 2 }],
    });
    expect(onResult).toHaveBeenLastCalledWith({
      final: true,
      words: [{ text: 'сука', startTime: 51, endTime: 52 }],
    });

    media.paused = true;
    media.dispatchEvent(new Event('pause'));
    media.currentTime = 60;
    media.paused = false;
    media.dispatchEvent(new Event('play'));
    emitSandboxMessage(iframe, {
      source: 'bleep-sandbox',
      type: 'result',
      words: [{ word: 'хуй', start: 1, end: 2 }],
    });
    expect(onResult).toHaveBeenLastCalledWith({
      final: true,
      words: [{ text: 'хуй', startTime: 61, endTime: 62 }],
    });
    expect(postMessage).toHaveBeenCalledWith(
      { target: 'bleep-sandbox', type: 'start', sampleRate: 48_000 },
      '*',
      undefined,
    );

    session.stop();
  });

  test('rejects preload when the sandbox reports a model error', async () => {
    const recognizer = createVoskSandboxSpeechRecognizer({
      modelUrl: 'chrome-extension://test/model.tar.gz',
      sandboxUrl: 'about:blank',
      fetch: async () => new Response(new Uint8Array([1, 2, 3])),
    });
    const preload = recognizer.preload();
    const iframe = document.querySelector('iframe')!;

    emitSandboxMessage(iframe, { source: 'bleep-sandbox', type: 'ready' });
    await flushMicrotasks();
    emitSandboxMessage(iframe, {
      source: 'bleep-sandbox',
      type: 'model-error',
      error: 'bad model',
    });

    await expect(preload).rejects.toBe('bad model');
  });
});
