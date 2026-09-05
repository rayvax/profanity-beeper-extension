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

import {
  startCaptionBeeper as createSession,
  type TimedCensorSessionOptions,
  type TranscriptBeeperSession,
} from './caption-beeper';

const sessions: TranscriptBeeperSession[] = [];

function startCaptionBeeper(options: TimedCensorSessionOptions): TranscriptBeeperSession {
  const session = createSession(options);
  sessions.push(session);
  return session;
}

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

class FakeCensorExecutor implements CensorExecutor {
  readonly activation: CensorExecutor['activation'] = { kind: 'on-execute' };
  readonly execute = mock(async () => {});
  readonly stop = mock(() => {});
  readonly listeners = new Set<(error: unknown) => void>();
  onError(listener: (error: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class DeferredCensorExecutor extends FakeCensorExecutor {
  readonly rejecters: Array<(reason?: unknown) => void> = [];

  override readonly execute = mock(
    (): Promise<void> => new Promise((_, reject) => this.rejecters.push(reject)),
  );
}

class ArmableCensorExecutor extends FakeCensorExecutor {
  override readonly activation = { kind: 'on-interaction', arm: () => this.arm() } as const;
  readonly arm = mock(async () => {});
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
    sessions.splice(0).forEach((session) => session.stop());
    console.error = originalConsoleError;
    document.body.innerHTML = '';
  });

  test('binds injected transcript source on watch page', async () => {
    const source = new FakeTranscriptSource();
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: new FakeCensorExecutor(),
    });

    await flushMicrotasks();

    expect(source.lastBindOptions).toBeDefined();
  });

  test('executes Censor ranges through injected timed-session seams', async () => {
    const source = new FakeTranscriptSource();
    const executor: CensorExecutor = new FakeCensorExecutor();
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
    const executor = new FakeCensorExecutor();
    executor.execute.mockRejectedValue(new Error('audio graph failed'));
    executor.stop.mockImplementation(stop);
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

  test('handles synchronous activation failure and stops the transcript', async () => {
    const source = new FakeTranscriptSource();
    const executor = new ArmableCensorExecutor();
    executor.arm.mockImplementation(() => {
      throw new Error('activation failed');
    });
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: badWordMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();
    executor.stop.mockClear();

    document.dispatchEvent(new Event('pointerdown'));
    await flushMicrotasks();
    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting', 'error']);
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(executor.stop).toHaveBeenCalledTimes(1);
    expect(executor.execute).not.toHaveBeenCalled();
    expect(executor.listeners.size).toBe(0);
  });

  test('does not report working when activation completes after stop', async () => {
    const executor = new ArmableCensorExecutor();
    const armed = Promise.withResolvers<void>();
    executor.arm.mockImplementation(() => armed.promise);
    const statuses: string[] = [];
    const session = startCaptionBeeper({
      source: new FakeTranscriptSource(),
      matcher: cleanMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();
    document.dispatchEvent(new Event('pointerdown'));
    session.stop();
    armed.resolve();
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting']);
    expect(executor.listeners.size).toBe(0);
  });

  test('restores playback on asynchronous executor errors and ignores later chunks', async () => {
    const source = new FakeTranscriptSource();
    const executor = new FakeCensorExecutor();
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: badWordMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();
    executor.stop.mockClear();

    executor.listeners.forEach((listener) => listener(new Error('renderer failed')));
    source.lastBindOptions?.onChunk({ text: 'bad', startTime: 4, endTime: 5 });
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting', 'working', 'error']);
    expect(executor.stop).toHaveBeenCalledTimes(1);
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(executor.execute).not.toHaveBeenCalled();
    expect(executor.listeners.size).toBe(0);
  });

  test('does not gate timedtext playback on an interaction', async () => {
    const source = new FakeTranscriptSource();
    const executor = new FakeCensorExecutor();
    const statuses: string[] = [];
    startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor,
      onStatus: (status) => statuses.push(status),
    });
    await flushMicrotasks();

    expect(statuses).toEqual(['waiting', 'working']);
  });

  test('updates active settings without rebinding the transcript source', async () => {
    const source = new FakeTranscriptSource();
    const updateSettings = mock(() => {});
    const session = startCaptionBeeper({
      source,
      matcher: cleanMatcher(),
      executor: new FakeCensorExecutor(),
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
      executor: Object.assign(new FakeCensorExecutor(), { stop }),
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
      executor: new FakeCensorExecutor(),
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
      executor: new FakeCensorExecutor(),
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
      executor: new FakeCensorExecutor(),
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
      executor: new FakeCensorExecutor(),
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
      executor: new FakeCensorExecutor(),
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
