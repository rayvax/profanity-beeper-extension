import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import { createBeepCensorExecutor } from './beep-censor-executor';

class FakeAudioContext {
  currentTime = 10;
  destination = {} as AudioDestinationNode;
  readonly gain = {
    gain: {
      cancelScheduledValues: mock(() => {}),
      setValueAtTime: mock(() => {}),
    },
    connect: mock(() => {}),
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
  createGain = mock(() => this.gain);
  createMediaElementSource = mock(() => this.mediaSource);
  createOscillator = mock(() => this.oscillator);
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
    const media = Object.assign(new EventTarget(), {
      currentTime: 12,
      paused: false,
      playbackRate: 1,
    }) as HTMLMediaElement;
    const executor = createBeepCensorExecutor(() => media);

    await executor.execute({ startTime: 12, endTime: 14 });

    expect(context.mediaSource.connect).toHaveBeenCalledWith(context.gain);
    expect(context.oscillator.start).toHaveBeenCalledWith(10);
    expect(context.oscillator.stop).toHaveBeenCalledWith(12);
    expect(context.gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(context.gain.gain.setValueAtTime).toHaveBeenCalledWith(1, 12);
  });

  test('fails without touching playback when the media is unavailable', async () => {
    const executor = createBeepCensorExecutor(() => null);

    await expect(executor.execute({ startTime: 12, endTime: 14 })).rejects.toThrow(
      'Player media not found',
    );

    expect(context.createMediaElementSource).not.toHaveBeenCalled();
  });

  test('keeps original audio muted through overlapping ranges', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 12,
      paused: false,
      playbackRate: 1,
    }) as HTMLMediaElement;
    const executor = createBeepCensorExecutor(() => media);

    await executor.execute({ startTime: 12, endTime: 14 });
    await executor.execute({ startTime: 12, endTime: 16 });

    expect(context.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 14);
  });
});
