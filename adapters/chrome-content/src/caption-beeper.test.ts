import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {
  ChunkMatcher,
  createDefaultCensorSettings,
  type CensorExecutor,
  type TranscriptSession,
  type TranscriptSource,
  type TranscriptSourceOptions,
} from '@beeper/core';

import { YoutubeEvent } from '@beeper/youtube';

import { startCaptionBeeper } from './caption-beeper';

const WATCH_URL = 'https://www.youtube.com/watch?v=test123';

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

class AbortedTranscriptSource implements TranscriptSource {
  async bind(): Promise<TranscriptSession> {
    throw new DOMException('The operation was aborted', 'AbortError');
  }
}

class DeferredTranscriptSource implements TranscriptSource {
  readonly resolvers: Array<(session: TranscriptSession) => void> = [];

  bind(): Promise<TranscriptSession> {
    return new Promise((resolve) => this.resolvers.push(resolve));
  }
}

class DeferredCensorExecutor implements CensorExecutor {
  readonly rejecters: Array<(reason?: unknown) => void> = [];

  execute(): Promise<void> {
    return new Promise((_, reject) => this.rejecters.push(reject));
  }
}

class ArmableCensorExecutor implements CensorExecutor {
  readonly arm = mock(async () => {});
  readonly execute = mock(async () => {});
}

function badWordMatcher(): ChunkMatcher {
  return new ChunkMatcher({ terms: ['bad'] });
}

function cleanMatcher(): ChunkMatcher {
  return new ChunkMatcher();
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('startCaptionBeeper', () => {
  let originalConsoleError: typeof console.error;

  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register({ url: WATCH_URL });
    }
  });

  beforeEach(() => {
    originalConsoleError = console.error;
    document.body.innerHTML = `<div class="html5-video-player"></div>`;
    window.history.pushState({}, '', '/watch?v=test123');
  });

  afterEach(() => {
    console.error = originalConsoleError;
    document.body.innerHTML = '';
  });

  test('binds injected transcript source on watch page', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(() => {}) },
    });

    await flushMicrotasks();

    expect(source.lastBindOptions).toBeDefined();
  });

  test('executes Censor ranges through injected timed-session seams', async () => {
    const source = new FakeTranscriptSource();
    const executor: CensorExecutor = { execute: mock(() => {}) };
    const statuses: string[] = [];
    const onTranscript = mock(() => {});

    startCaptionBeeper({
      source,
      matcher: badWordMatcher(),
      executor,
      onTranscript,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    await flushMicrotasks();

    expect(executor.execute).toHaveBeenCalledWith({ startTime: 4, endTime: 5 });
    expect(onTranscript).toHaveBeenCalledWith({
      chunk: { text: 'bad', startTime: 4, endTime: 5 },
      censored: true,
    });
    expect(statuses).toEqual(['waiting', 'working']);
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
    startCaptionBeeper({
      source,
      matcher: badWordMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();
    stop.mockClear();

    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    await flushMicrotasks();

    expect(stop).toHaveBeenCalled();
    expect(statuses).toContain('error');
  });

  test('waits for an ordinary page interaction before arming ML playback', async () => {
    const source = new FakeTranscriptSource();
    const executor = new ArmableCensorExecutor();
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor,
      armOnInteraction: true,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting']);
    expect(executor.arm).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('pointerdown'));
    await flushMicrotasks();

    expect(executor.arm).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['waiting', 'working']);
  });

  test('does not gate timedtext playback on an interaction', async () => {
    const source = new FakeTranscriptSource();
    const executor = new ArmableCensorExecutor();
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    expect(executor.arm).not.toHaveBeenCalled();
    expect(statuses).toEqual(['waiting', 'working']);
  });

  test('updates active settings without rebinding the transcript source', async () => {
    const source = new FakeTranscriptSource();
    const updateSettings = mock(() => {});
    const session = startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(async () => {}) },
      updateSettings,
    });
    await flushMicrotasks();
    source.stop.mockClear();
    const settings = { ...createDefaultCensorSettings(), delaySeconds: 2 };

    session.updateSettings(settings);

    expect(updateSettings).toHaveBeenCalledWith(settings);
    expect(source.stop).not.toHaveBeenCalled();
  });

  test('restores playback and reports an error from speech recognition', async () => {
    const source = new FakeTranscriptSource();
    const stop = mock(() => {});
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(async () => {}), stop },
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();
    stop.mockClear();

    source.lastBindOptions?.onError?.(new Error('recognizer failed'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(statuses).toContain('error');
  });

  test('bind failure reports an error status', async () => {
    const source = new FailingTranscriptSource();
    const errorSpy = mock(() => {});
    const statuses: string[] = [];

    console.error = errorSpy;
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(async () => {}) },
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalled();
    expect(statuses).toEqual(['waiting', 'error']);
  });

  test('does not report a navigation abort as a censor error', async () => {
    const statuses: string[] = [];
    startCaptionBeeper({
      source: new AbortedTranscriptSource(),
      matcher: cleanMatcher(),
      executor: { execute: mock(async () => {}) },
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting']);
  });

  test('unbind stops transcript session on rebind', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(() => {}) },
    });
    await flushMicrotasks();

    // Different video id: same-page yt-navigate-finish must rebind.
    window.history.pushState({}, '', '/watch?v=other456');
    document.dispatchEvent(new Event(YoutubeEvent.NAVIGATE_FINISH));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(source.stop).toHaveBeenCalled();
  });

  test('same-video yt-navigate-finish does not rebind', async () => {
    const source = new FakeTranscriptSource();
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(() => {}) },
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting', 'working']);

    document.dispatchEvent(new Event(YoutubeEvent.NAVIGATE_FINISH));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(source.stop).not.toHaveBeenCalled();
    expect(statuses).toEqual(['waiting', 'working']);
  });

  test('stops a stale session that finishes binding after a rebind', async () => {
    const source = new DeferredTranscriptSource();
    const staleStop = mock(() => {});
    const currentStop = mock(() => {});
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: { execute: mock(() => {}) },
    });
    await flushMicrotasks();

    // Different video id: same-page yt-navigate-finish must rebind.
    window.history.pushState({}, '', '/watch?v=other456');
    document.dispatchEvent(new Event(YoutubeEvent.NAVIGATE_FINISH));
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
    startCaptionBeeper({
      source,
      matcher: badWordMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    window.history.pushState({}, '', '/watch?v=other456');
    document.dispatchEvent(new Event(YoutubeEvent.NAVIGATE_FINISH));
    await new Promise((resolve) => setTimeout(resolve, 200));
    executor.rejecters[0]?.(new Error('stale executor failed'));
    await flushMicrotasks();

    expect(statuses).not.toContain('error');
  });
});
