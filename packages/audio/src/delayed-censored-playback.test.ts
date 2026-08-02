import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import { createDelayedCensoredPlayback } from './delayed-censored-playback';

class FakeAudioContext {
  currentTime = 10;
  sampleRate = 48_000;
  state: AudioContextState = 'running';
  destination = {} as AudioDestinationNode;
  readonly source = { connect: mock(() => {}) };
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
      beep: true,
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({ startTime: 10, endTime: 11 });

    expect(context.delay.delayTime.value).toBe(1.2);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(11.05);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[1]?.[1]).toBeCloseTo(12.36);
    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(11.05);
    expect(context.oscillator.stop.mock.calls[0]?.[0]).toBeCloseTo(12.35);
  });

  test('restores immediate unmuted audio when stopped', async () => {
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = createDelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      beep: false,
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    playback.stop();

    expect(context.delay.delayTime.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(context.gain.gain.setValueAtTime).toHaveBeenCalledWith(1, 10);
  });
});
