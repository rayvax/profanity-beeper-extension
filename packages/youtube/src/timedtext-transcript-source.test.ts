import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { TranscriptChunk, TranscriptSourceOptions } from '@beeper/core';

import { YoutubeTimedtextSource } from './timedtext-transcript-source';

function createOptions(chunks: TranscriptChunk[]): TranscriptSourceOptions {
  return {
    onChunk: (chunk) => chunks.push(chunk),
  };
}

describe('YoutubeTimedtextSource', () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register({ url: 'https://www.youtube.com/watch?v=video' });
    }
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  test('emits timed transcript chunks from a JSON3 caption track', async () => {
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => 'https://www.youtube.com/api/timedtext?v=video',
      fetch: async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                tStartMs: 1_500,
                dDurationMs: 2_000,
                segs: [{ utf8: 'Ну ' }, { utf8: 'дурак!' }],
              },
            ],
          }),
        ),
    });

    await source.bind(createOptions(chunks));

    expect(chunks).toEqual([{ text: 'Ну дурак!', startTime: 1.5, endTime: 3.5 }]);
  });

  test('uses segment offsets when a caption track provides word timing', async () => {
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => 'https://www.youtube.com/api/timedtext?v=video',
      fetch: async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                tStartMs: 1_000,
                dDurationMs: 3_000,
                segs: [
                  { utf8: 'Ну ', tOffsetMs: 0 },
                  { utf8: 'дурак!', tOffsetMs: 1_500 },
                ],
              },
            ],
          }),
        ),
    });

    await source.bind(createOptions(chunks));

    expect(chunks).toEqual([
      { text: 'Ну', startTime: 1, endTime: 2.5 },
      { text: 'дурак!', startTime: 2.5, endTime: 4 },
    ]);
  });

  test('fails when no caption track is available', async () => {
    const source = new YoutubeTimedtextSource({ getTrackUrl: () => undefined });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Caption track not found');
  });

  test('reads the first caption track from the YouTube page', async () => {
    document.head.innerHTML = `
      <script>
        var playerResponse = {
          "captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=video"}]
        };
      </script>
    `;
    const fetch = mock(async () => new Response(JSON.stringify({ events: [] })));
    const source = new YoutubeTimedtextSource({ fetch });

    await source.bind(createOptions([]));

    expect(fetch).toHaveBeenCalledWith(
      'https://www.youtube.com/api/timedtext?v=video&fmt=json3',
      expect.anything(),
    );
  });

  test('fails open when a caption track has malformed data', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => 'https://www.youtube.com/api/timedtext?v=video',
      fetch: async () => new Response(JSON.stringify({ events: {} })),
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Malformed caption data');
  });

  test('fails open when a caption segment is malformed', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => 'https://www.youtube.com/api/timedtext?v=video',
      fetch: async () =>
        new Response(
          JSON.stringify({
            events: [{ tStartMs: 0, dDurationMs: 1_000, segs: [{ utf8: 42 }] }],
          }),
        ),
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Malformed caption data');
  });

  test('fails open when a word offset falls outside its cue', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => 'https://www.youtube.com/api/timedtext?v=video',
      fetch: async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                tStartMs: 0,
                dDurationMs: 1_000,
                segs: [{ utf8: 'дурак', tOffsetMs: -1 }],
              },
            ],
          }),
        ),
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Malformed caption data');
  });
});
