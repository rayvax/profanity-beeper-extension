import { describe, expect, test } from 'bun:test';

import {
  decodeTimedTextHtml,
  isBlockedHtmlResponse,
  normalizeTimedTextParagraph,
  normalizeTimedTextSegment,
  splitWordsToTimedCues,
} from './timedtext-utils';

describe('decodeTimedTextHtml', () => {
  test('decodes html entities', () => {
    expect(decodeTimedTextHtml('hello&amp;world')).toBe('hello&world');
    expect(decodeTimedTextHtml('&lt;tag&gt;')).toBe('<tag>');
  });
});

describe('normalizeTimedTextSegment', () => {
  test('strips zero-width spaces and trims', () => {
    expect(normalizeTimedTextSegment('  hello\u200bworld  ')).toBe('helloworld');
  });

  test('decodes entities before normalizing', () => {
    expect(normalizeTimedTextSegment('a&amp;b')).toBe('a&b');
  });
});

describe('normalizeTimedTextParagraph', () => {
  test('collapses runs of three or more newlines', () => {
    expect(normalizeTimedTextParagraph('line1\n\n\n\nline2')).toBe('line1\n\nline2');
  });
});

describe('isBlockedHtmlResponse', () => {
  test('returns false for json bodies', () => {
    expect(isBlockedHtmlResponse('{"events":[]}')).toBe(false);
  });

  test('returns false for non-html text', () => {
    expect(isBlockedHtmlResponse('plain text')).toBe(false);
  });

  test('returns true for full html error pages', () => {
    expect(isBlockedHtmlResponse('<html><body>Sorry...</body></html>')).toBe(true);
  });

  test('returns true for unusual traffic message', () => {
    expect(isBlockedHtmlResponse('<div>unusual traffic from your network</div>')).toBe(true);
  });
});

describe('splitWordsToTimedCues', () => {
  test('returns empty for blank text', () => {
    expect(splitWordsToTimedCues(0, 1000, '   ')).toEqual([]);
  });

  test('returns single cue for one word', () => {
    expect(splitWordsToTimedCues(100, 500, 'hello')).toEqual([
      { startMs: 100, endMs: 500, text: 'hello' },
    ]);
  });

  test('splits multiple words across duration', () => {
    const cues = splitWordsToTimedCues(0, 2000, 'hello world');

    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 0, endMs: 1000, text: 'hello' });
    expect(cues[1]).toEqual({ startMs: 1000, endMs: 2000, text: 'world' });
  });
});
