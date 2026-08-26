import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import { createBeepCensorExecutor } from './beep-censor-executor';

class FakeAudioContext {
  currentTime = 10;
  state: AudioContextState = 'running';
  destination = {} as AudioDestinationNode;
  readonly gain = {
    gain: {
      cancelScheduledValues: mock(() => {}),
      setValueAtTime: mock(() => {}),
      linearRampToValueAtTime: mock(() => {}),
    },
    connect: mock(() => {}),
  };
  readonly delay = {
    connect: mock(() => {}),
    delayTime: {
      cancelScheduledValues: mock(() => {}),
      setValueAtTime: mock(() => {}),
    },
  };
  readonly mediaSource = { connect: mock(() => {}) };
  readonly oscillator = {
    connect: mock(() => {}),
    frequency: { value: 0 },
    start: mock(() => {}),
    onended: null as (() => void) | null,
    stop: mock(() => this.oscillator.onended?.()),
  };
  resume = mock(async () => {});
  close = mock(async () => {});
  createDelay = mock(() => this.delay);
  createGain = mock(() => this.gain);
  createMediaElementSource = mock(() => this.mediaSource);
  createOscillator = mock(() => this.oscillator);
}

function createMedia(currentTime: number): HTMLMediaElement {
  return Object.assign(new EventTarget(), {
    currentTime,
    paused: false,
    playbackRate: 1,
  }) as HTMLMediaElement;
}

let originalAudioContext: typeof AudioContext | undefined;
let context: FakeAudioContext;

describe('createBeepCensorExecutor', () => {
  beforeEach(() => {
    originalAudioContext = globalThis.AudioContext;
    context = new FakeAudioContext();
    globalThis.AudioContext = class {
      constructor() {
        return context;
      }
    } as unknown as typeof AudioContext;
  });

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext as typeof AudioContext;
  });

  test('mutes the media and schedules a beep on the media timeline', async () => {
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    await executor.arm();
    await executor.execute({ startTime: 12, endTime: 14 });

    expect(context.mediaSource.connect).toHaveBeenCalledWith(context.delay);
    expect(context.delay.connect).toHaveBeenCalledWith(context.gain);
    expect(context.oscillator.start).toHaveBeenCalledWith(10);
    expect(context.oscillator.stop).toHaveBeenCalledWith(12);
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.01);
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 12.01);
  });

  test('fails without touching playback when the media is unavailable', async () => {
    const executor = createBeepCensorExecutor(() => null);

    await expect(executor.execute({ startTime: 12, endTime: 14 })).rejects.toThrow(
      'Player media not found',
    );

    expect(context.createMediaElementSource).not.toHaveBeenCalled();
  });

  test('keeps original audio muted through overlapping ranges', async () => {
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    await executor.arm();
    await executor.execute({ startTime: 12, endTime: 14 });
    await executor.execute({ startTime: 12, endTime: 16 });

    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 14.01);
  });

  test('arms immediate playback lazily for the first timed range', async () => {
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    await executor.execute({ startTime: 12, endTime: 14 });

    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(context.oscillator.start).toHaveBeenCalledWith(10);
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.01);
  });

  test('shares one media source across concurrent arms and executes', async () => {
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    executor.execute({ startTime: 12, endTime: 14 });
    executor.execute({ startTime: 20, endTime: 22 });
    await Promise.all([executor.arm(), executor.arm()]);

    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  test('fails open without touching the media while the audio context stays suspended', async () => {
    context.state = 'suspended';
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    await expect(executor.arm()).rejects.toThrow('AudioContext is blocked');

    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });

  test('rejects a queued range when stopped before arming', async () => {
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    const executed = executor.execute({ startTime: 12, endTime: 14 });
    executor.stop();

    await expect(executed).rejects.toThrow('Censor executor stopped');
  });

  test('discards a graph that finishes arming after stop', async () => {
    let resumeContext: () => void = () => {};
    context.resume = mock(
      () =>
        new Promise<void>((resolve) => {
          resumeContext = resolve;
        }),
    );
    const media = createMedia(12);
    const executor = createBeepCensorExecutor(() => media);

    const arming = executor.arm();
    executor.stop();
    resumeContext();
    await arming;

    expect(context.close).not.toHaveBeenCalled();

    executor.execute({ startTime: 12, endTime: 14 });
    expect(context.oscillator.start).not.toHaveBeenCalled();
  });
});
