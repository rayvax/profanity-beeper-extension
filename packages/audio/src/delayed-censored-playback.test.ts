import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import { createCensorAudioExecutor } from './censor-audio-executor';
import { createDelayedCensoredPlayback } from './delayed-censored-playback';

class FakeAudioContext {
  currentTime = 10;
  sampleRate = 48_000;
  state: AudioContextState = 'running';
  destination = {} as AudioDestinationNode;
  readonly source = { connect: mock(() => {}), disconnect: mock(() => {}) };
  readonly delay = {
    connect: mock(() => {}),
    delayTime: {
      value: 0,
      cancelScheduledValues: mock(() => {}),
      setValueAtTime: mock(() => {}),
    },
  };
  readonly gain = {
    connect: mock(() => {}),
    gain: {
      value: 0,
      cancelScheduledValues: mock(() => {}),
      setValueAtTime: mock(() => {}),
      linearRampToValueAtTime: mock(() => {}),
    },
  };
  readonly tap = {
    connect: mock(() => {}),
    disconnect: mock(() => {}),
    onaudioprocess: null as unknown,
  };
  readonly oscillator = {
    connect: mock(() => {}),
    frequency: { value: 0 },
    onended: null as (() => void) | null,
    start: mock(() => {}),
    stop: mock(() => {}),
  };
  audioWorklet = { addModule: mock(async () => Promise.reject(new Error('no worklet'))) };
  resume = mock(async () => {});
  close = mock(async () => {});
  createMediaElementSource = mock(() => this.source);
  createDelay = mock(() => this.delay);
  createGain = mock(() => this.gain);
  createScriptProcessor = mock(() => this.tap);
  createOscillator = mock(() => this.oscillator);
}

let originalAudioContext: typeof AudioContext | undefined;
let context: FakeAudioContext;

describe('createDelayedCensoredPlayback', () => {
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

  test('delays one shared censor window around a timed word', async () => {
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({ startTime: 10, endTime: 11 });

    expect(context.delay.delayTime.setValueAtTime).toHaveBeenCalledWith(1.2, 10);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(11.05);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[1]?.[1]).toBeCloseTo(12.36);
    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(11.05);
    expect(context.oscillator.stop.mock.calls[0]?.[0]).toBeCloseTo(12.35);
  });

  test('converts a 2× media-time offset to the matching audio-context duration', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      playbackRate: 2,
    }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({ startTime: 20, endTime: 21 });

    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(16.05);
    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(16.05);
  });

  test('censors a final result that arrives after the word begins in the media timeline', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 14,
      playbackRate: 2,
    }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({ startTime: 12, endTime: 14 });

    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(10.05);
    expect(context.oscillator.stop.mock.calls[0]?.[0]).toBeCloseTo(11.35);
  });

  test('keeps the configured delay after scaling an offset at 0.5×', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      playbackRate: 0.5,
    }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({ startTime: 20, endTime: 21 });

    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(31.05);
  });

  test('restores immediate unmuted audio when stopped', async () => {
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'silence',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    playback.stop();

    expect(context.delay.delayTime.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(context.gain.gain.setValueAtTime).toHaveBeenCalledWith(1, 10);
  });

  test('reuses the media source when switching from captions to ML', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      paused: false,
      playbackRate: 1,
    }) as HTMLMediaElement;
    const captions = createCensorAudioExecutor(() => media);
    const ml = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'silence',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await captions.arm();
    captions.stop();
    await ml.arm();

    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(context.delay.delayTime.setValueAtTime).toHaveBeenLastCalledWith(1.2, 10);
  });

  test('restores pass-through audio when the recognition tap fails', async () => {
    context.createScriptProcessor = mock(() => {
      throw new Error('tap unavailable');
    });
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'silence',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await expect(playback.arm()).rejects.toThrow('tap unavailable');

    expect(context.delay.delayTime.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    expect(context.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 10);
  });

  test('reschedules adjacent future ranges without muting clean audio early', async () => {
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'silence',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });
    await playback.arm();
    await playback.execute({ startTime: 10, endTime: 11 });
    context.gain.gain.setValueAtTime.mockClear();
    context.gain.gain.linearRampToValueAtTime.mockClear();

    await playback.execute({ startTime: 11, endTime: 12 });

    expect(context.gain.gain.setValueAtTime).toHaveBeenCalledWith(1, 10);
    expect(context.gain.gain.setValueAtTime).not.toHaveBeenCalledWith(0, 10);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[0]).toBe(0);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(11.05);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[1]?.[0]).toBe(1);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[1]?.[1]).toBeCloseTo(13.36);
  });

  test('moves pending windows and replaces their effect when settings change', async () => {
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });
    await playback.arm();
    await playback.execute({ startTime: 10, endTime: 11 });
    context.createOscillator.mockClear();
    context.gain.gain.linearRampToValueAtTime.mockClear();

    playback.updateOptions({ delaySeconds: 2, effect: 'silence' });

    expect(context.delay.delayTime.setValueAtTime).toHaveBeenLastCalledWith(2, 10);
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(11.85);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[1]?.[1]).toBeCloseTo(13.16);
  });
});
