import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

type SandboxMessage = {
  target: 'bleep-sandbox';
  type: string;
  model?: ArrayBuffer;
  pcm?: ArrayBuffer;
};
type ParentMessage = { source?: string; type?: string };

class FakeRecognizer {
  private readonly listeners = new Map<string, (message: unknown) => void>();

  on(event: string, listener: (message: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  setWords(): void {}

  acceptWaveformFloat(): void {}

  retrieveFinalResult(): void {
    this.listeners.get('result')?.({
      result: { text: 'сука', result: [{ word: 'сука', start: 0, end: 0.4 }] },
    });
  }
}

test('sandbox flushes a final Vosk result when the audio stream stops', async () => {
  const listeners = new Map<string, (event: { data: SandboxMessage }) => void | Promise<void>>();
  const posted: ParentMessage[] = [];
  const sandboxWindow = {
    parent: { postMessage: (message: ParentMessage) => posted.push(message) },
    addEventListener: (
      type: string,
      listener: (event: { data: SandboxMessage }) => void | Promise<void>,
    ) => listeners.set(type, listener),
  };
  const context = createContext({
    window: sandboxWindow,
    Vosk: { createModel: async () => ({ KaldiRecognizer: FakeRecognizer }) },
    Blob,
    URL,
    console,
    setTimeout,
    clearTimeout,
    performance,
  });
  const source = await readFile(new URL('../public/sandbox.js', import.meta.url), 'utf8');
  runInContext(source, context);

  const send = async (message: SandboxMessage) => {
    await listeners.get('message')?.({ data: message });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  await send({ target: 'bleep-sandbox', type: 'init', model: new ArrayBuffer(1) });
  await send({ target: 'bleep-sandbox', type: 'start' });
  await send({ target: 'bleep-sandbox', type: 'audio', pcm: new Float32Array([0]).buffer });
  await send({ target: 'bleep-sandbox', type: 'stop' });

  expect(posted).toContainEqual({
    source: 'bleep-sandbox',
    type: 'result',
    text: 'сука',
    words: [{ word: 'сука', start: 0, end: 0.4 }],
  });
});
