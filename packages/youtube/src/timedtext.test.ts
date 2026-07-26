import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import type { CaptionTrack } from './caption-track';
import { getCaptionTextDelta } from './caption-text-delta';
import { parseJson3Response, parseJson3ToCues } from './parse-json3-cues';
import { selectCaptionTrack } from './select-caption-track';

describe('timedtext helpers', () => {
  beforeAll(() => {
    try {
      GlobalRegistrator.register({ url: 'https://www.youtube.com/watch?v=test123' });
    } catch {
      // Happy DOM may already be registered by another test file.
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('getCaptionTextDelta', () => {
    test('returns full current when previous empty', () => {
      expect(getCaptionTextDelta('', 'hello world')).toBe('hello world');
    });

    test('returns suffix delta when current extends previous', () => {
      expect(getCaptionTextDelta('hello', 'hello world')).toBe('world');
    });

    test('returns current when cue text changes', () => {
      expect(getCaptionTextDelta('foo', 'bar')).toBe('bar');
    });
  });

  describe('parseJson3ToCues', () => {
    test('parses timed events into cues', () => {
      const cues = parseJson3ToCues({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 2000,
            segs: [{ utf8: 'hello world' }],
          },
          {
            tStartMs: 4000,
            dDurationMs: 1500,
            segs: [{ utf8: 'next cue' }],
          },
        ],
      });

      expect(cues).toEqual([
        { startMs: 1000, endMs: 3000, text: 'hello world' },
        { startMs: 4000, endMs: 5500, text: 'next cue' },
      ]);
    });

    test('skips events without timing or text', () => {
      const cues = parseJson3ToCues({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [] },
          { tStartMs: 1000, segs: [{ utf8: 'no duration' }] },
        ],
      });

      expect(cues).toEqual([]);
    });
  });

  describe('parseJson3Response', () => {
    test('returns empty for blocked html', () => {
      expect(parseJson3Response('<html><body>Sorry...</body></html>')).toEqual([]);
    });

    test('parses json body', () => {
      const cues = parseJson3Response(
        JSON.stringify({
          events: [
            {
              tStartMs: 500,
              dDurationMs: 1000,
              segs: [{ utf8: 'test' }],
            },
          ],
        }),
      );

      expect(cues).toEqual([{ startMs: 500, endMs: 1500, text: 'test' }]);
    });
  });

  describe('selectCaptionTrack', () => {
    const tracks: CaptionTrack[] = [
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=de',
        languageCode: 'de',
        languageName: 'German',
        vssId: '.de',
        kind: 'manual',
      },
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en',
        languageCode: 'en',
        languageName: 'English',
        vssId: 'a.en',
        kind: 'asr',
      },
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=fr',
        languageCode: 'fr',
        languageName: 'French',
        vssId: '.fr',
      },
    ];

    test('prefers asr track in browser language', () => {
      const selected = selectCaptionTrack(tracks);
      expect(selected?.languageCode).toBe('en');
      expect(selected?.kind).toBe('asr');
    });

    test('falls back to first track when no asr match', () => {
      const nonAsrTracks: CaptionTrack[] = [
        {
          baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=de',
          languageCode: 'de',
          languageName: 'German',
        },
        {
          baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=ja',
          languageCode: 'ja',
          languageName: 'Japanese',
        },
      ];

      const selected = selectCaptionTrack(nonAsrTracks);
      expect(selected?.languageCode).toBe('de');
    });
  });
});
