import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {
  MessageType,
  type CensorExecutor,
  type CensorLexicon,
  type Messaging,
  type TranscriptSession,
  type TranscriptSource,
  type TranscriptSourceOptions,
} from '@beeper/core';

import { startCaptionBeeper } from './caption-beeper';

const WATCH_URL = 'https://www.youtube.com/watch?v=test123';
const INDICATOR_SELECTOR = '[data-beeper-indicator]';

class FakeTranscriptSource implements TranscriptSource {
  lastBindOptions: TranscriptSourceOptions | undefined;
  stop = mock(() => {});

  async bind(options: TranscriptSourceOptions): Promise<TranscriptSession> {
    this.lastBindOptions = options;
    return { stop: this.stop };
  }
}

class FailingTranscriptSource implements TranscriptSource {
  async bind(): Promise<TranscriptSession> {
    throw new Error('bind failed');
  }
}

class DeferredTranscriptSource implements TranscriptSource {
  readonly resolvers: Array<(session: TranscriptSession) => void> = [];

  bind(): Promise<TranscriptSession> {
    return new Promise((resolve) => this.resolvers.push(resolve));
  }
}

class TranscriptSourceWithSourceProperty extends FakeTranscriptSource {
  source = 'still a transcript source';
}

class DeferredCensorExecutor implements CensorExecutor {
  readonly rejecters: Array<(reason?: unknown) => void> = [];

  execute(): Promise<void> {
    return new Promise((_, reject) => this.rejecters.push(reject));
  }
}

function createMessaging(sendImpl: Messaging['send']): Messaging {
  return {
    send: sendImpl,
    on: () => () => {},
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getIndicatorText(): string | undefined {
  return document.querySelector(INDICATOR_SELECTOR)?.textContent ?? undefined;
}

describe('startCaptionBeeper', () => {
  beforeAll(() => {
    GlobalRegistrator.register({ url: WATCH_URL });
  });

  beforeEach(() => {
    document.body.innerHTML = `<div class="html5-video-player"></div>`;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('binds injected transcript source on watch page', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      source,
    );

    await flushMicrotasks();

    expect(source.lastBindOptions).toBeDefined();
    expect(getIndicatorText()).toBe('🧼');
  });

  test('transcript chunk sends WORD_CAPTURED through messaging', async () => {
    const send = mock(async () => ({ ok: true, censored: false }));
    const source = new FakeTranscriptSource();

    startCaptionBeeper(createMessaging(send), source);
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'hello' });
    await flushMicrotasks();

    expect(send).toHaveBeenCalledWith({
      type: MessageType.WORD_CAPTURED,
      word: 'hello',
    });
  });

  test('keeps accepting a Transcript source with a source property', async () => {
    const source = new TranscriptSourceWithSourceProperty();
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      source,
    );

    await flushMicrotasks();

    expect(source.lastBindOptions).toBeDefined();
  });

  test('executes Censor ranges through injected timed-session seams', async () => {
    const send = mock(async () => ({ ok: true, censored: false }));
    const source = new FakeTranscriptSource();
    const executor: CensorExecutor = { execute: mock(() => {}) };
    const lexicon: CensorLexicon = { matches: (token) => token === 'bad' };
    const statuses: string[] = [];

    startCaptionBeeper(createMessaging(send), {
      source,
      lexicon,
      executor,
      settings: { enabled: true },
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    await flushMicrotasks();

    expect(executor.execute).toHaveBeenCalledWith({ startTime: 4, endTime: 5 });
    expect(send).not.toHaveBeenCalled();
    expect(statuses).toEqual(['loading', 'working']);
  });

  test('restores playback before reporting an executor failure', async () => {
    const source = new FakeTranscriptSource();
    const stop = mock(() => {});
    const executor: CensorExecutor = {
      execute: async () => {
        throw new Error('audio graph failed');
      },
      stop,
    };
    const statuses: string[] = [];
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      {
        source,
        lexicon: { matches: (token) => token === 'bad' },
        executor,
        settings: { enabled: true },
        onStatus: (status) => statuses.push(status),
      },
    );
    await flushMicrotasks();
    stop.mockClear();

    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    await flushMicrotasks();

    expect(stop).toHaveBeenCalled();
    expect(statuses).toContain('error');
  });

  test('bind failure shows error indicator', async () => {
    const source = new FailingTranscriptSource();
    const errorSpy = mock(() => {});

    console.error = errorSpy;
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      source,
    );
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalled();
    expect(getIndicatorText()).toBe('⚠️');
  });

  test('unbind stops transcript session on rebind', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      source,
    );
    await flushMicrotasks();

    document.dispatchEvent(new Event('yt-navigate-finish'));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(source.stop).toHaveBeenCalled();
  });

  test('stops a stale session that finishes binding after a rebind', async () => {
    const source = new DeferredTranscriptSource();
    const staleStop = mock(() => {});
    const currentStop = mock(() => {});
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      source,
    );
    await flushMicrotasks();

    document.dispatchEvent(new Event('yt-navigate-finish'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    source.resolvers[0]?.({ stop: staleStop });
    source.resolvers[1]?.({ stop: currentStop });
    await flushMicrotasks();

    expect(staleStop).toHaveBeenCalled();
    expect(currentStop).not.toHaveBeenCalled();
  });

  test('ignores a stale executor failure after a rebind', async () => {
    const source = new FakeTranscriptSource();
    const executor = new DeferredCensorExecutor();
    const statuses: string[] = [];
    startCaptionBeeper(
      createMessaging(async () => ({ ok: true, censored: false })),
      {
        source,
        lexicon: { matches: (token) => token === 'bad' },
        executor,
        settings: { enabled: true },
        onStatus: (status) => statuses.push(status),
      },
    );
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    document.dispatchEvent(new Event('yt-navigate-finish'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    executor.rejecters[0]?.(new Error('stale executor failed'));
    await flushMicrotasks();

    expect(statuses).not.toContain('error');
  });
});
