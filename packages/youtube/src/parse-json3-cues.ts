export type TimedTextCue = {
  startMs: number;
  endMs: number;
  text: string;
};

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

function decodeHtml(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function isBlockedHtmlResponse(body: string): boolean {
  const trimmed = body.trim();

  if (!trimmed.startsWith('<')) {
    return false;
  }

  if (/^<html[\s\S]*<\/body>\s*<\/html>$/i.test(trimmed)) {
    return true;
  }

  if (/Sorry\.\.\./i.test(trimmed)) {
    return true;
  }

  if (/unusual traffic/i.test(trimmed)) {
    return true;
  }

  return false;
}

function mergeAdjacentDuplicateCues(cues: TimedTextCue[]): TimedTextCue[] {
  if (cues.length <= 1) {
    return cues;
  }

  const merged: TimedTextCue[] = [{ ...cues[0] }];

  for (let i = 1; i < cues.length; i++) {
    const current = cues[i];
    const previous = merged[merged.length - 1];

    if (current.text === previous.text && current.startMs <= previous.endMs + 50) {
      previous.endMs = current.endMs;
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
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

    const text = event.segs
      .map((seg) => seg.utf8 ?? '')
      .join('')
      .replace(/\u200b/g, '')
      .trim();

    const decodedText = decodeHtml(text)
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!decodedText) {
      continue;
    }

    cues.push({
      startMs: event.tStartMs,
      endMs: event.tStartMs + event.dDurationMs,
      text: decodedText,
    });
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
