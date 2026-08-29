import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  MessageType,
  Messaging,
  type TranscriptSession,
  type TranscriptSource,
  type TranscriptSourceOptions,
} from '@beeper/core';

import { YoutubeEvent } from '@beeper/youtube';

import { startCaptionBeeper } from './caption-beeper';

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

function stubMessaging(sendImpl: Messaging['send']): Messaging {
  return new Messaging({
    send: (message) => sendImpl(message as Parameters<Messaging['send']>[0]),
    addListener: () => () => {},
  });
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getIndicatorText(): string | undefined {
  return document.querySelector(INDICATOR_SELECTOR)?.textContent ?? undefined;
}

describe('startCaptionBeeper', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div class="html5-video-player"></div>`;
    window.history.pushState({}, '', '/watch?v=test123');
  });

  test('binds injected transcript source on watch page', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper(
      stubMessaging(async () => ({ ok: true, censored: false })),
      source,
    );

    await flushMicrotasks();

    expect(source.lastBindOptions).toBeDefined();
    expect(getIndicatorText()).toBe('🧼');
  });

  test('transcript chunk sends CHUNK_CAPTURED through messaging', async () => {
    const send = mock(async () => ({ ok: true as const, censored: false }));
    const source = new FakeTranscriptSource();

    startCaptionBeeper(stubMessaging(send as Messaging['send']), source);
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'hello' });
    await flushMicrotasks();

    expect(send).toHaveBeenCalledWith({
      type: MessageType.CHUNK_CAPTURED,
      text: 'hello',
    });
  });

  test('bind failure shows error indicator', async () => {
    const source = new FailingTranscriptSource();
    const errorSpy = mock(() => {});

    console.error = errorSpy;
    startCaptionBeeper(
      stubMessaging(async () => ({ ok: true, censored: false })),
      source,
    );
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalled();
    expect(getIndicatorText()).toBe('⚠️');
  });

  test('unbind stops transcript session on rebind', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper(
      stubMessaging(async () => ({ ok: true, censored: false })),
      source,
    );
    await flushMicrotasks();

    // Different video id: same-page yt-navigate-finish must rebind.
    window.history.pushState({}, '', '/watch?v=other456');
    document.dispatchEvent(new Event(YoutubeEvent.NAVIGATE_FINISH));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(source.stop).toHaveBeenCalled();
  });

  test('same-video yt-navigate-finish does not rebind', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper(
      stubMessaging(async () => ({ ok: true, censored: false })),
      source,
    );
    await flushMicrotasks();

    expect(getIndicatorText()).toBe('🧼');

    document.dispatchEvent(new Event(YoutubeEvent.NAVIGATE_FINISH));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(source.stop).not.toHaveBeenCalled();
    expect(getIndicatorText()).toBe('🧼');
  });

  test('censored response signals player on fixture DOM', async () => {
    document.body.innerHTML = `
      <div class="html5-video-player">
        <video class="video-stream"></video>
      </div>
    `;

    const send = mock(async () => ({ ok: true as const, censored: true }));
    const source = new FakeTranscriptSource();

    startCaptionBeeper(stubMessaging(send as Messaging['send']), source);
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'bad' });
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const container = document.querySelector('.html5-video-player') as HTMLElement;
    expect(container.style.backgroundColor).toBe('red');
  });
});
