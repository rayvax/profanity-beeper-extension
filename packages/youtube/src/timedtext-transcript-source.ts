import type {
  TranscriptChunk,
  TranscriptSession,
  TranscriptSource,
  TranscriptSourceOptions,
} from '@beeper/core';

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
  getTrackUrl?: () => string | undefined;
  fetch?: typeof globalThis.fetch;
};

export class YoutubeTimedtextSource implements TranscriptSource {
  private readonly getTrackUrl: () => string | undefined;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: YoutubeTimedtextSourceOptions = {}) {
    this.getTrackUrl = options.getTrackUrl ?? getCaptionTrackUrlFromPage;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async bind(options: TranscriptSourceOptions): Promise<TranscriptSession> {
    const trackUrl = this.getTrackUrl();
    if (!trackUrl) {
      throw new Error('Caption track not found');
    }

    const response = await this.fetch(json3TrackUrl(trackUrl), { signal: options.signal });
    if (!response.ok) {
      throw new Error(`Caption track request failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    const chunks = parseTimedtext(payload);

    if (!options.signal?.aborted) {
      chunks.forEach(options.onChunk);
    }

    return { stop() {} };
  }
}

function getCaptionTrackUrlFromPage(): string | undefined {
  for (const script of document.scripts) {
    const trackUrl = extractCaptionTrackUrl(script.textContent ?? '');
    if (trackUrl) {
      return trackUrl;
    }
  }

  return undefined;
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
