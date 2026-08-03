import { describe, expect, test } from 'bun:test';

import type { CaptionTrack } from './caption-track';
import { getCaptionTextDelta } from './caption-text-delta';
import { parseJson3Response, parseJson3ToCues } from './parse-json3-cues';
import { parseTimedtextXml } from './parse-timedtext-xml';
import { selectCaptionTrack } from './select-caption-track';

describe('timedtext helpers', () => {
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
    test('parses timed events into word-level cues', () => {
      const cues = parseJson3ToCues({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 2000,
            segs: [
              { utf8: 'hello ', tOffsetMs: 0 },
              { utf8: 'world', tOffsetMs: 1000 },
            ],
          },
          {
            tStartMs: 4000,
            dDurationMs: 1500,
            segs: [{ utf8: 'next cue' }],
          },
        ],
      });

      expect(cues).toEqual([
        { startMs: 1000, endMs: 2000, text: 'hello' },
        { startMs: 2000, endMs: 3000, text: 'world' },
        { startMs: 4000, endMs: 4750, text: 'next' },
        { startMs: 4750, endMs: 5500, text: 'cue' },
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

  describe('parseTimedtextXml', () => {
    test('parses span-level srv3 cues with offsets', () => {
      const cues = parseTimedtextXml(`<?xml version="1.0" encoding="utf-8" ?>
<timedtext format="3">
<body>
<p t="1000" d="3000"><s t="0">hello </s><s t="1000">world</s></p>
</body>
</timedtext>`);

      expect(cues).toEqual([
        { startMs: 1000, endMs: 2000, text: 'hello' },
        { startMs: 2000, endMs: 4000, text: 'world' },
      ]);
    });

    test('splits plain paragraph text across duration when no spans', () => {
      const cues = parseTimedtextXml(`<?xml version="1.0" encoding="utf-8" ?>
<timedtext format="3">
<body>
<p t="0" d="2000">hello world</p>
</body>
</timedtext>`);

      expect(cues).toHaveLength(2);
      expect(cues[0]).toEqual({ startMs: 0, endMs: 1000, text: 'hello' });
      expect(cues[1]).toEqual({ startMs: 1000, endMs: 2000, text: 'world' });
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
