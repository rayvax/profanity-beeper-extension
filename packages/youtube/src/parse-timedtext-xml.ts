import type { TimedTextCue } from './timed-text-cue';
import {
  normalizeTimedTextParagraph,
  normalizeTimedTextSegment,
  splitWordsToTimedCues,
} from './timedtext-utils';

function readSpanText(span: Element): string {
  return normalizeTimedTextSegment(span.textContent ?? '');
}

function pushSpanCues(
  cues: TimedTextCue[],
  paragraphStartMs: number,
  paragraphDurationMs: number,
  spans: Element[],
): void {
  let previousOffset = 0;

  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const startOffset = span.hasAttribute('t')
      ? Number(span.getAttribute('t'))
      : index === 0
        ? 0
        : previousOffset;
    previousOffset = startOffset;

    let endOffset = paragraphDurationMs;
    for (let nextIndex = index + 1; nextIndex < spans.length; nextIndex++) {
      if (spans[nextIndex].hasAttribute('t')) {
        endOffset = Number(spans[nextIndex].getAttribute('t'));
        break;
      }
    }

    const text = readSpanText(span);
    if (!text) {
      continue;
    }

    cues.push({
      startMs: paragraphStartMs + startOffset,
      endMs: paragraphStartMs + (endOffset > startOffset ? endOffset : startOffset + 300),
      text,
    });
  }
}

export function parseTimedtextXml(rawBody: string): TimedTextCue[] {
  const body = rawBody.trim();
  if (!body.startsWith('<')) {
    return [];
  }

  const document = new DOMParser().parseFromString(body, 'text/xml');
  const paragraphs = document.querySelectorAll('timedtext body p, body p');
  const cues: TimedTextCue[] = [];

  for (const paragraph of paragraphs) {
    const startAttr = paragraph.getAttribute('t');
    const durationAttr = paragraph.getAttribute('d');
    if (startAttr == null || durationAttr == null) {
      continue;
    }

    const paragraphStartMs = Number(startAttr);
    const paragraphDurationMs = Number(durationAttr);
    if (Number.isNaN(paragraphStartMs) || Number.isNaN(paragraphDurationMs)) {
      continue;
    }

    const spans = Array.from(paragraph.children).filter(
      (child) => child.tagName.toLowerCase() === 's',
    );
    if (spans.length > 0) {
      pushSpanCues(cues, paragraphStartMs, paragraphDurationMs, spans);
      continue;
    }

    const decodedText = normalizeTimedTextParagraph(paragraph.textContent ?? '');
    if (!decodedText) {
      continue;
    }

    cues.push(
      ...splitWordsToTimedCues(
        paragraphStartMs,
        paragraphStartMs + paragraphDurationMs,
        decodedText,
      ),
    );
  }

  return cues;
}
