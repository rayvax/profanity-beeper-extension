import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import { CensorAudioExecutor } from './censor-audio-executor';
import { DelayedCensoredPlayback } from './delayed-censored-playback';

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
  suspend = mock(async () => {});
  close = mock(async () => {});
  createMediaElementSource = mock(() => this.source);
  createDelay = mock(() => this.delay);
  createGain = mock(() => this.gain);
  createScriptProcessor = mock(() => this.tap);
  createOscillator = mock(() => this.oscillator);
}

let originalAudioContext: typeof AudioContext | undefined;
let context: FakeAudioContext;

describe('DelayedCensoredPlayback', () => {
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

  test.each([true, false])(
    'drains censored audio after pause then ended (ended at pause: %s)',
    async (endedAtPause) => {
      const media = Object.assign(new EventTarget(), {
        currentTime: 10,
        paused: false,
        ended: false,
        playbackRate: 1,
      }) as HTMLMediaElement;
      const playback = new DelayedCensoredPlayback(() => media, {
        delaySeconds: 1.2,
        effect: 'beep',
        workletUrl: 'test.js',
      });
      await playback.arm();
      await playback.execute({ startTime: 9.8, endTime: 10, final: false, token: 'bad' });
      context.delay.delayTime.setValueAtTime.mockClear();
      context.gain.gain.cancelScheduledValues.mockClear();
      Object.assign(media, { paused: true, ended: endedAtPause });
      media.dispatchEvent(new Event('pause'));
      Object.assign(media, { ended: true });
      media.dispatchEvent(new Event('ended'));
      if (endedAtPause) expect(context.suspend).not.toHaveBeenCalled();
      expect(context.resume.mock.calls.length).toBeGreaterThan(1);
      expect(context.delay.delayTime.setValueAtTime).not.toHaveBeenCalled();
      expect(context.gain.gain.cancelScheduledValues).not.toHaveBeenCalled();

      // Recognition may confirm the last word while the delayed tail is draining.
      context.currentTime = 10.4;
      await playback.execute({ startTime: 9.8, endTime: 10, final: true, token: 'bad' });
      expect(context.gain.gain.linearRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(11.36);
      Object.assign(media, { ended: false, paused: false, currentTime: 0 });
      media.dispatchEvent(new Event('play'));
      await playback.execute({ startTime: 0, endTime: 0.1 });
      expect(context.gain.gain.linearRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(11.86);
      playback.stop();
      context.resume.mockClear();
      media.dispatchEvent(new Event('ended'));
      media.dispatchEvent(new Event('play'));
      expect(context.resume).not.toHaveBeenCalled();
      await expect(playback.execute({ startTime: 0, endTime: 1 })).rejects.toThrow('not armed');
    },
  );

  test('freezes buffered audio immediately on pause and resumes the same buffer', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      paused: false,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'test.js',
    });
    await playback.arm();
    context.resume.mockClear();
    context.delay.delayTime.setValueAtTime.mockClear();
    Object.assign(media, { paused: true });
    media.dispatchEvent(new Event('pause'));
    expect(context.suspend).toHaveBeenCalledTimes(1);
    Object.assign(media, { paused: false });
    media.dispatchEvent(new Event('play'));
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.delay.delayTime.setValueAtTime).not.toHaveBeenCalled();
    playback.stop();
  });

  test('releases a pending pause on stop and removes media listeners', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      paused: false,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'test.js',
    });
    await playback.arm();
    const paused = Promise.withResolvers<void>();
    context.suspend.mockImplementation(() => paused.promise);
    context.resume.mockClear();
    media.dispatchEvent(new Event('pause'));
    playback.stop();
    expect(context.resume).toHaveBeenCalledTimes(1);
    paused.resolve();
    await paused.promise;
    media.dispatchEvent(new Event('pause'));
    media.dispatchEvent(new Event('play'));
    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  test('keeps audio suspended when armed on an already paused video', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      paused: true,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'test.js',
    });
    await playback.arm();
    expect(context.suspend).toHaveBeenCalledTimes(1);
    playback.stop();
  });

  test('reports resume failure and restores pass-through playback', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      paused: false,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'test.js',
    });
    await playback.arm();
    const failure = new Error('resume failed');
    const onError = mock(() => {});
    const dispose = playback.onError(onError);
    context.resume.mockRejectedValueOnce(failure);
    media.dispatchEvent(new Event('pause'));
    media.dispatchEvent(new Event('play'));
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(context.resume).toHaveBeenCalledTimes(3);
    expect(context.delay.delayTime.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    await expect(playback.execute({ startTime: 10, endTime: 11 })).rejects.toThrow('not armed');
    dispose();
  });

  test('delays one shared censor window around a timed word', async () => {
    const media = Object.assign(new EventTarget(), { currentTime: 10 }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
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
    const playback = new DelayedCensoredPlayback(() => media, {
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
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({ startTime: 12, endTime: 14 });

    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(10.05);
    expect(context.oscillator.stop.mock.calls[0]?.[0]).toBeCloseTo(11.35);
  });

  test('schedules a provisional word before the final utterance boundary', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      playbackRate: 1,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });

    await playback.arm();
    await playback.execute({
      startTime: 9.4,
      endTime: 10.06,
      final: false,
      token: 'сука',
    });

    expect(context.oscillator.start.mock.calls[0]?.[0]).toBeCloseTo(10.58);
    expect(context.oscillator.stop.mock.calls[0]?.[0]).toBeCloseTo(11.28);
  });

  test('replaces a provisional window with final timing for the same token', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      playbackRate: 1,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
      delaySeconds: 1.2,
      effect: 'beep',
      workletUrl: 'chrome-extension://test/audio-worklet.js',
    });
    await playback.arm();
    await playback.execute({
      startTime: 9.4,
      endTime: 10.06,
      final: false,
      token: 'сука',
    });
    context.gain.gain.linearRampToValueAtTime.mockClear();

    await playback.execute({
      startTime: 9.8,
      endTime: 10,
      final: true,
      token: 'сука',
    });

    expect(context.gain.gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(10.85);
  });

  test('keeps the configured delay after scaling an offset at 0.5×', async () => {
    const media = Object.assign(new EventTarget(), {
      currentTime: 10,
      playbackRate: 0.5,
    }) as HTMLMediaElement;
    const playback = new DelayedCensoredPlayback(() => media, {
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
    const playback = new DelayedCensoredPlayback(() => media, {
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
    const captions = new CensorAudioExecutor(() => media);
    const ml = new DelayedCensoredPlayback(() => media, {
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
    const playback = new DelayedCensoredPlayback(() => media, {
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
    const playback = new DelayedCensoredPlayback(() => media, {
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
    const playback = new DelayedCensoredPlayback(() => media, {
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
