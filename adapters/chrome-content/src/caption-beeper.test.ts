import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {
  MessageType,
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
    const send = mock(async () => ({ ok: true as const, censored: false }));
    const source = new FakeTranscriptSource();

    startCaptionBeeper(createMessaging(send as Messaging['send']), source);
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'hello' });
    await flushMicrotasks();

    expect(send).toHaveBeenCalledWith({
      type: MessageType.WORD_CAPTURED,
      word: 'hello',
    });
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
});
