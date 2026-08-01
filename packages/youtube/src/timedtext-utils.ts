import type { TimedTextCue } from './timed-text-cue';

export function decodeTimedTextHtml(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

export function normalizeTimedTextSegment(text: string): string {
  return decodeTimedTextHtml(text)
    .replace(/\u200b/g, '')
    .trim();
}

export function normalizeTimedTextParagraph(text: string): string {
  return normalizeTimedTextSegment(text).replace(/\n{3,}/g, '\n\n');
}

export function isBlockedHtmlResponse(body: string): boolean {
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

export function splitWordsToTimedCues(
  startMs: number,
  endMs: number,
  text: string,
): TimedTextCue[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  if (words.length <= 1) {
    return [{ startMs, endMs, text }];
  }

  const durationMs = endMs - startMs;
  const msPerWord = Math.max(durationMs, 1) / words.length;

  return words.map((word, index) => {
    const wordStartMs = startMs + index * msPerWord;
    return {
      startMs: wordStartMs,
      endMs: wordStartMs + msPerWord,
      text: word,
    };
  });
}
