import type { TimedTextCue } from './timed-text-cue';
import {
  isBlockedHtmlResponse,
  normalizeTimedTextSegment,
  splitWordsToTimedCues,
} from './timedtext-utils';

type Json3Seg = {
  utf8?: string;
  tOffsetMs?: number;
};

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
};

type Json3Response = {
  events?: Json3Event[];
};

function mergeAdjacentDuplicateCues(cues: TimedTextCue[]): TimedTextCue[] {
  if (cues.length <= 1) {
    return cues;
  }

  const merged: TimedTextCue[] = [{ ...cues[0] }];

  for (let i = 1; i < cues.length; i++) {
    const current = cues[i];
    const previous = merged[merged.length - 1];

    if (
      current.text === previous.text &&
      current.startMs === previous.startMs &&
      current.startMs <= previous.endMs + 50
    ) {
      previous.endMs = current.endMs;
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

function pushJson3SegCues(
  cues: TimedTextCue[],
  eventStartMs: number,
  eventDurationMs: number,
  segs: Json3Seg[],
): void {
  let previousOffset = 0;

  for (let index = 0; index < segs.length; index++) {
    const startOffset = segs[index].tOffsetMs ?? (index === 0 ? 0 : previousOffset);
    previousOffset = startOffset;

    let endOffset: number | null = null;
    for (let nextIndex = index + 1; nextIndex < segs.length; nextIndex++) {
      if (segs[nextIndex].tOffsetMs != null) {
        endOffset = segs[nextIndex].tOffsetMs ?? null;
        break;
      }
    }

    const segEndOffset = endOffset ?? (eventDurationMs > 0 ? eventDurationMs : startOffset + 300);
    const segStartMs = eventStartMs + startOffset;
    const segEndMs = eventStartMs + segEndOffset;

    const segText = normalizeTimedTextSegment(segs[index].utf8 ?? '');
    if (!segText) {
      continue;
    }

    cues.push(...splitWordsToTimedCues(segStartMs, segEndMs, segText));
  }
}

export function parseJson3ToCues(data: Json3Response): TimedTextCue[] {
  const events = data.events ?? [];
  const cues: TimedTextCue[] = [];

  for (const event of events) {
    if (event.tStartMs == null || event.dDurationMs == null) {
      continue;
    }
    if (!event.segs?.length) {
      continue;
    }

    pushJson3SegCues(cues, event.tStartMs, event.dDurationMs, event.segs);
  }

  return mergeAdjacentDuplicateCues(cues);
}

export function parseJson3Response(rawBody: string): TimedTextCue[] {
  const body = rawBody.trim();

  if (!body) {
    return [];
  }

  if (isBlockedHtmlResponse(body)) {
    return [];
  }

  if (!body.startsWith('{')) {
    return [];
  }

  try {
    return parseJson3ToCues(JSON.parse(body) as Json3Response);
  } catch {
    return [];
  }
}
