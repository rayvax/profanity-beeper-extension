import type {
  TranscriptChunk,
  TranscriptSession,
  TranscriptSource,
  TranscriptSourceOptions,
} from '@beeper/core';

import { PlayerSelector } from './selectors';

type TimedtextSegment = {
  utf8?: unknown;
  tOffsetMs?: unknown;
};

type TimedtextEvent = {
  tStartMs?: unknown;
  dDurationMs?: unknown;
  segs?: unknown;
};

type TimedtextResponse = {
  events?: unknown;
};

export type YoutubeTimedtextSourceOptions = {
  getTrackUrl?: () => string | undefined | Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  getMedia?: () => HTMLMediaElement | null;
  lookaheadSeconds?: number;
  pollIntervalMs?: number;
};

const DEFAULT_LOOKAHEAD_SECONDS = 1.25;
const DEFAULT_POLL_INTERVAL_MS = 250;
const SEEK_BACK_TOLERANCE_SECONDS = 0.5;

export class YoutubeTimedtextSource implements TranscriptSource {
  private readonly getTrackUrl: () => string | undefined | Promise<string | undefined>;
  private readonly fetch: typeof globalThis.fetch;
  private readonly getMedia: () => HTMLMediaElement | null;
  private readonly lookaheadSeconds: number;
  private readonly pollIntervalMs: number;

  constructor(options: YoutubeTimedtextSourceOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.getTrackUrl = options.getTrackUrl ?? (() => getCaptionTrackUrlFromPage(this.fetch));
    this.getMedia = options.getMedia ?? getPlayerMediaFromPage;
    this.lookaheadSeconds = options.lookaheadSeconds ?? DEFAULT_LOOKAHEAD_SECONDS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async bind(options: TranscriptSourceOptions): Promise<TranscriptSession> {
    const trackUrl = await this.getTrackUrl();
    if (!trackUrl) {
      throw new Error('Caption track not found');
    }

    const response = await this.fetch(json3TrackUrl(trackUrl), { signal: options.signal });
    if (!response.ok) {
      throw new Error(`Caption track request failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    const chunks = parseTimedtext(payload).sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

    const media = this.getMedia();
    if (!media) {
      throw new Error('Player media not found');
    }

    // Chunks reach the consumer as media time advances, so the Censor
    // executor can schedule each range shortly before it plays.
    let nextIndex = 0;
    let lastMediaTime = media.currentTime;
    const emitDueChunks = () => {
      // A media element pulled from the DOM means SPA teardown; rebind.
      if (media.isConnected === false) {
        stop();
        options.onDetach?.();
        return;
      }
      const now = media.currentTime;
      if (now < lastMediaTime - SEEK_BACK_TOLERANCE_SECONDS) {
        nextIndex = chunks.findIndex((chunk) => (chunk.endTime ?? 0) > now);
        if (nextIndex === -1) {
          nextIndex = chunks.length;
        }
      }
      lastMediaTime = now;

      // Never emit chunks that already finished playing (bind mid-video,
      // forward seek): their ranges would only produce stale beeps.
      while (nextIndex < chunks.length && (chunks[nextIndex].endTime ?? 0) <= now) {
        nextIndex++;
      }

      const horizon = now + this.lookaheadSeconds;
      while (nextIndex < chunks.length && (chunks[nextIndex].startTime ?? 0) <= horizon) {
        options.onChunk(chunks[nextIndex]);
        nextIndex++;
      }
    };

    const pollTimer = setInterval(emitDueChunks, this.pollIntervalMs);
    const stop = () => {
      clearInterval(pollTimer);
      media.removeEventListener('timeupdate', emitDueChunks);
      media.removeEventListener('seeked', emitDueChunks);
    };

    media.addEventListener('timeupdate', emitDueChunks);
    media.addEventListener('seeked', emitDueChunks);
    options.signal?.addEventListener('abort', stop, { once: true });

    if (!options.signal?.aborted) {
      emitDueChunks();
    } else {
      stop();
    }

    return { stop };
  }
}

function getPlayerMediaFromPage(): HTMLMediaElement | null {
  const media = document.querySelector(PlayerSelector.VIDEO);
  return media instanceof HTMLMediaElement ? media : null;
}

// The caption track URL lives in an inline script — but after an SPA
// navigation the previous video's script stays in the DOM, so an inline
// track is only trusted when its video id matches the current watch page.
// Otherwise the current watch page HTML is fetched and scanned the same way.
async function getCaptionTrackUrlFromPage(
  fetchFn: typeof globalThis.fetch,
): Promise<string | undefined> {
  const pageVideoId = new URLSearchParams(location.search).get('v');
  for (const script of document.scripts) {
    const trackUrl = extractCaptionTrackUrl(script.textContent ?? '');
    if (trackUrl && isCurrentVideoTrack(trackUrl, pageVideoId)) {
      return trackUrl;
    }
  }

  try {
    const response = await fetchFn(location.href);
    if (!response.ok) {
      return undefined;
    }
    return extractCaptionTrackUrl(await response.text());
  } catch {
    return undefined;
  }
}

function isCurrentVideoTrack(trackUrl: string, pageVideoId: string | null): boolean {
  if (!pageVideoId) {
    return true;
  }

  try {
    const trackVideoId = new URL(trackUrl).searchParams.get('v');
    return !trackVideoId || trackVideoId === pageVideoId;
  } catch {
    return true;
  }
}

function extractCaptionTrackUrl(script: string): string | undefined {
  const captionTracksIndex = script.indexOf('"captionTracks":');
  if (captionTracksIndex === -1) {
    return undefined;
  }

  const arrayStart = script.indexOf('[', captionTracksIndex);
  const arrayEnd = findJsonArrayEnd(script, arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    return undefined;
  }

  try {
    const tracks: unknown = JSON.parse(script.slice(arrayStart, arrayEnd + 1));
    const firstTrack = Array.isArray(tracks) ? tracks[0] : undefined;
    return isRecord(firstTrack) && typeof firstTrack.baseUrl === 'string'
      ? firstTrack.baseUrl
      : undefined;
  } catch {
    return undefined;
  }
}

function findJsonArrayEnd(value: string, start: number): number {
  let depth = 0;
  let isEscaped = false;
  let isInString = false;

  for (let index = start; index < value.length; index++) {
    const character = value[index];

    if (isInString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === '\\') {
        isEscaped = true;
      } else if (character === '"') {
        isInString = false;
      }
      continue;
    }

    if (character === '"') {
      isInString = true;
    } else if (character === '[') {
      depth++;
    } else if (character === ']') {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function json3TrackUrl(trackUrl: string): string {
  const url = new URL(trackUrl);
  url.searchParams.set('fmt', 'json3');
  return url.toString();
}

function parseTimedtext(payload: unknown): TranscriptChunk[] {
  if (!isRecord(payload) || !Array.isArray((payload as TimedtextResponse).events)) {
    throw new Error('Malformed caption data');
  }

  return (payload.events as unknown[]).flatMap(parseTimedtextEvent);
}

function parseTimedtextEvent(event: unknown): TranscriptChunk[] {
  if (!isRecord(event)) {
    throw new Error('Malformed caption data');
  }

  const { tStartMs, dDurationMs, segs } = event as TimedtextEvent;
  if (segs === undefined) {
    return [];
  }
  if (
    !Number.isFinite(tStartMs) ||
    !Number.isFinite(dDurationMs) ||
    typeof tStartMs !== 'number' ||
    typeof dDurationMs !== 'number' ||
    dDurationMs <= 0 ||
    !Array.isArray(segs)
  ) {
    throw new Error('Malformed caption data');
  }

  const segments = segs.map(parseTimedtextSegment);

  if (hasSegmentTiming(segments)) {
    return segments.flatMap((segment, index) => {
      const text = segment.text.trim();
      if (!text) {
        return [];
      }

      if (segment.offsetMs < 0 || segment.offsetMs >= dDurationMs) {
        throw new Error('Malformed caption data');
      }

      const nextOffsetMs = segments[index + 1]?.offsetMs ?? dDurationMs;
      if (nextOffsetMs <= segment.offsetMs) {
        throw new Error('Malformed caption data');
      }

      return [
        {
          text,
          startTime: (tStartMs + segment.offsetMs) / 1_000,
          endTime: (tStartMs + nextOffsetMs) / 1_000,
        },
      ];
    });
  }

  const text = segments
    .map((segment) => segment.text)
    .join('')
    .trim();

  return text
    ? [{ text, startTime: tStartMs / 1_000, endTime: (tStartMs + dDurationMs) / 1_000 }]
    : [];
}

function parseTimedtextSegment(segment: unknown): { text: string; offsetMs?: number } {
  if (!isRecord(segment)) {
    throw new Error('Malformed caption data');
  }

  const { utf8, tOffsetMs } = segment as TimedtextSegment;
  if (
    typeof utf8 !== 'string' ||
    (tOffsetMs !== undefined && (!Number.isFinite(tOffsetMs) || typeof tOffsetMs !== 'number'))
  ) {
    throw new Error('Malformed caption data');
  }

  return { text: utf8, offsetMs: tOffsetMs };
}

function hasSegmentTiming(
  segments: Array<{ text: string; offsetMs?: number }>,
): segments is Array<{ text: string; offsetMs: number }> {
  return segments.every((segment) => segment.offsetMs !== undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
