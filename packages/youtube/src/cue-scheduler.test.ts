import { describe, expect, test } from 'bun:test';

import { createCueScheduler } from './cue-scheduler';
import type { TimedTextCue } from './timed-text-cue';

type PendingTimer = {
  id: number;
  fn: () => void;
  at: number;
};

function createFakeTimers() {
  let nowMs = 0;
  let nextId = 0;
  const pending: PendingTimer[] = [];

  const setTimer = (fn: () => void, delay: number) => {
    const id = nextId++;
    pending.push({ id, fn, at: nowMs + delay });
    return id;
  };

  const clearTimer = (id: unknown) => {
    const index = pending.findIndex((timer) => timer.id === id);
    if (index !== -1) {
      pending.splice(index, 1);
    }
  };

  const advance = (ms: number) => {
    nowMs += ms;
    const ready = pending.filter((timer) => timer.at <= nowMs).sort((a, b) => a.at - b.at);
    for (const timer of ready) {
      const index = pending.findIndex((entry) => entry.id === timer.id);
      if (index !== -1) {
        pending.splice(index, 1);
      }
      timer.fn();
    }
  };

  const setNow = (ms: number) => {
    nowMs = ms;
  };

  return { setTimer, clearTimer, advance, setNow, getNow: () => nowMs };
}

const cues: TimedTextCue[] = [
  { startMs: 1000, endMs: 2000, text: 'hello' },
  { startMs: 2500, endMs: 3500, text: 'world' },
  { startMs: 5000, endMs: 6000, text: 'again' },
];

describe('createCueScheduler', () => {
  test('emits cues in chain at their startMs', () => {
    const timers = createFakeTimers();
    const chunks: string[] = [];
    let paused = false;

    const scheduler = createCueScheduler({
      cues,
      getCurrentTimeMs: timers.getNow,
      isPaused: () => paused,
      onChunk: (chunk) => chunks.push(chunk.text),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    scheduler.start();
    expect(chunks).toEqual([]);

    timers.advance(1000);
    expect(chunks).toEqual(['hello']);

    timers.advance(1500);
    expect(chunks).toEqual(['hello', 'world']);

    timers.advance(2500);
    expect(chunks).toEqual(['hello', 'world', 'again']);
  });

  test('starts from current playback position', () => {
    const timers = createFakeTimers();
    timers.setNow(3000);
    const chunks: string[] = [];

    const scheduler = createCueScheduler({
      cues,
      getCurrentTimeMs: timers.getNow,
      isPaused: () => false,
      onChunk: (chunk) => chunks.push(chunk.text),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    scheduler.start();
    timers.advance(2000);
    expect(chunks).toEqual(['again']);
  });

  test('onSeek resets chain and reschedules from new position', () => {
    const timers = createFakeTimers();
    const chunks: string[] = [];

    const scheduler = createCueScheduler({
      cues,
      getCurrentTimeMs: timers.getNow,
      isPaused: () => false,
      onChunk: (chunk) => chunks.push(chunk.text),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    scheduler.start();
    timers.advance(1000);
    expect(chunks).toEqual(['hello']);

    timers.setNow(0);
    scheduler.onSeek();
    timers.advance(1000);
    expect(chunks).toEqual(['hello', 'hello']);
  });

  test('onPause clears pending timer and onPlay resumes chain', () => {
    const timers = createFakeTimers();
    const chunks: string[] = [];
    let paused = false;

    const scheduler = createCueScheduler({
      cues,
      getCurrentTimeMs: timers.getNow,
      isPaused: () => paused,
      onChunk: (chunk) => chunks.push(chunk.text),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    scheduler.start();
    timers.advance(1000);
    expect(chunks).toEqual(['hello']);

    paused = true;
    scheduler.onPause();
    timers.advance(2000);
    expect(chunks).toEqual(['hello']);

    paused = false;
    scheduler.onPlay();
    timers.advance(1500);
    expect(chunks).toEqual(['hello', 'world']);
  });

  test('stop clears pending timers', () => {
    const timers = createFakeTimers();
    const chunks: string[] = [];

    const scheduler = createCueScheduler({
      cues,
      getCurrentTimeMs: timers.getNow,
      isPaused: () => false,
      onChunk: (chunk) => chunks.push(chunk.text),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    scheduler.start();
    scheduler.stop();
    timers.advance(5000);
    expect(chunks).toEqual([]);
  });
});
