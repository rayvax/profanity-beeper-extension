import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { TranscriptChunk, TranscriptSession, TranscriptSourceOptions } from '@beeper/core';

import { YoutubeTimedtextSource } from './timedtext-transcript-source';

function createOptions(chunks: TranscriptChunk[]): TranscriptSourceOptions {
  return {
    onChunk: (chunk) => chunks.push(chunk),
  };
}

function createMedia(currentTime: number): HTMLMediaElement {
  return Object.assign(new EventTarget(), {
    currentTime,
    paused: false,
    playbackRate: 1,
  }) as HTMLMediaElement;
}

function advance(media: HTMLMediaElement, currentTime: number): void {
  media.currentTime = currentTime;
  media.dispatchEvent(new Event('timeupdate'));
}

function json3Response(events: unknown[]): Response {
  return new Response(JSON.stringify({ events }));
}

function trackUrl(videoId?: string): string {
  const id = videoId ?? new URLSearchParams(location.search).get('v') ?? 'video';
  return `https://www.youtube.com/api/timedtext?v=${id}`;
}

describe('YoutubeTimedtextSource', () => {
  const sessions: TranscriptSession[] = [];

  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register({ url: 'https://www.youtube.com/watch?v=video' });
    }
  });

  afterEach(() => {
    sessions.splice(0).forEach((session) => session.stop());
    document.head.innerHTML = '';
  });

  async function bind(source: YoutubeTimedtextSource, chunks: TranscriptChunk[]) {
    const session = await source.bind(createOptions(chunks));
    sessions.push(session);
    return session;
  }

  test('emits a chunk when media time reaches its start', async () => {
    const media = createMedia(0);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([
          { tStartMs: 5_000, dDurationMs: 2_000, segs: [{ utf8: 'Ну ' }, { utf8: 'дурак!' }] },
        ]),
      getMedia: () => media,
      lookaheadSeconds: 0.25,
    });

    await bind(source, chunks);
    expect(chunks).toEqual([]);

    advance(media, 4.8);
    expect(chunks).toEqual([{ text: 'Ну дурак!', startTime: 5, endTime: 7 }]);
  });

  test('emits chunks that start within the lookahead window', async () => {
    const media = createMedia(4);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([
          { tStartMs: 5_000, dDurationMs: 2_000, segs: [{ utf8: 'дурак' }] },
          { tStartMs: 30_000, dDurationMs: 2_000, segs: [{ utf8: 'позже' }] },
        ]),
      getMedia: () => media,
      lookaheadSeconds: 1.25,
    });

    await bind(source, chunks);

    expect(chunks).toEqual([{ text: 'дурак', startTime: 5, endTime: 7 }]);
  });

  test('emits word-timed chunks as playback reaches each word', async () => {
    const media = createMedia(0);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([
          {
            tStartMs: 1_000,
            dDurationMs: 3_000,
            segs: [
              { utf8: 'Ну ', tOffsetMs: 0 },
              { utf8: 'дурак!', tOffsetMs: 1_500 },
            ],
          },
        ]),
      getMedia: () => media,
      lookaheadSeconds: 0.25,
    });

    await bind(source, chunks);
    expect(chunks).toEqual([]);

    advance(media, 1.1);
    expect(chunks).toEqual([{ text: 'Ну', startTime: 1, endTime: 2.5 }]);

    advance(media, 2.6);
    expect(chunks).toEqual([
      { text: 'Ну', startTime: 1, endTime: 2.5 },
      { text: 'дурак!', startTime: 2.5, endTime: 4 },
    ]);
  });

  test('re-emits upcoming chunks after seeking back', async () => {
    const media = createMedia(6);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([{ tStartMs: 5_000, dDurationMs: 2_000, segs: [{ utf8: 'дурак' }] }]),
      getMedia: () => media,
      lookaheadSeconds: 0.25,
    });

    await bind(source, chunks);
    expect(chunks).toEqual([{ text: 'дурак', startTime: 5, endTime: 7 }]);

    advance(media, 0);
    advance(media, 4.8);
    expect(chunks).toEqual([
      { text: 'дурак', startTime: 5, endTime: 7 },
      { text: 'дурак', startTime: 5, endTime: 7 },
    ]);
  });

  test('skips the track backlog when binding mid-video', async () => {
    const media = createMedia(100);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([
          { tStartMs: 5_000, dDurationMs: 2_000, segs: [{ utf8: 'давно' }] },
          { tStartMs: 100_500, dDurationMs: 2_000, segs: [{ utf8: 'дурак' }] },
        ]),
      getMedia: () => media,
      lookaheadSeconds: 1.25,
    });

    await bind(source, chunks);

    expect(chunks).toEqual([{ text: 'дурак', startTime: 100.5, endTime: 102.5 }]);
  });

  test('skips chunks jumped over by a forward seek', async () => {
    const media = createMedia(0);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([
          { tStartMs: 5_000, dDurationMs: 2_000, segs: [{ utf8: 'пропущено' }] },
          { tStartMs: 50_000, dDurationMs: 2_000, segs: [{ utf8: 'дурак' }] },
        ]),
      getMedia: () => media,
      lookaheadSeconds: 1.25,
    });

    await bind(source, chunks);
    advance(media, 50);

    expect(chunks).toEqual([{ text: 'дурак', startTime: 50, endTime: 52 }]);
  });

  test('stops emitting after the session stops', async () => {
    const media = createMedia(0);
    const chunks: TranscriptChunk[] = [];
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([{ tStartMs: 5_000, dDurationMs: 2_000, segs: [{ utf8: 'дурак' }] }]),
      getMedia: () => media,
      lookaheadSeconds: 0.25,
    });

    const session = await bind(source, chunks);
    session.stop();

    advance(media, 6);
    expect(chunks).toEqual([]);
  });

  test('fails when no caption track is available', async () => {
    const source = new YoutubeTimedtextSource({ getTrackUrl: () => undefined });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Caption track not found');
  });

  test('fails when the player media is unavailable', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () => json3Response([]),
      getMedia: () => null,
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Player media not found');
  });

  test('reads the first caption track from the YouTube page', async () => {
    document.head.innerHTML = `
      <script>
        var playerResponse = {
          "captionTracks":[{"baseUrl":"${trackUrl()}"}]
        };
      </script>
    `;
    const fetch = mock(async () => json3Response([]));
    const source = new YoutubeTimedtextSource({ fetch, getMedia: () => createMedia(0) });

    await bind(source, []);

    expect(fetch).toHaveBeenCalledWith(`${trackUrl()}&fmt=json3`, expect.anything());
  });

  test('ignores an inline caption track left by a previous video', async () => {
    document.head.innerHTML = `
      <script>
        var playerResponse = {
          "captionTracks":[{"baseUrl":"${trackUrl('previous-video')}"}]
        };
      </script>
    `;
    const media = createMedia(0);
    const chunks: TranscriptChunk[] = [];
    const fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/timedtext')) {
        return json3Response([{ tStartMs: 0, dDurationMs: 1_000, segs: [{ utf8: 'дурак' }] }]);
      }
      return new Response(
        `<html><script>var r={"captionTracks":[{"baseUrl":"${trackUrl()}"}]};</script></html>`,
      );
    });
    const source = new YoutubeTimedtextSource({
      fetch,
      getMedia: () => media,
      lookaheadSeconds: 0.25,
    });

    await bind(source, chunks);
    advance(media, 0);

    expect(fetch).toHaveBeenCalledWith(location.href);
    expect(chunks).toEqual([{ text: 'дурак', startTime: 0, endTime: 1 }]);
  });

  test('falls back to the watch page HTML after an SPA navigation', async () => {
    const media = createMedia(0);
    const chunks: TranscriptChunk[] = [];
    const fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/timedtext')) {
        return json3Response([{ tStartMs: 0, dDurationMs: 1_000, segs: [{ utf8: 'дурак' }] }]);
      }
      return new Response(
        `<html><script>var r={"captionTracks":[{"baseUrl":"${trackUrl()}"}]};</script></html>`,
      );
    });
    const source = new YoutubeTimedtextSource({
      fetch,
      getMedia: () => media,
      lookaheadSeconds: 0.25,
    });

    await bind(source, chunks);
    advance(media, 0);

    expect(fetch).toHaveBeenCalledWith(location.href);
    expect(chunks).toEqual([{ text: 'дурак', startTime: 0, endTime: 1 }]);
  });

  test('fails open when a caption track has malformed data', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () => new Response(JSON.stringify({ events: {} })),
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Malformed caption data');
  });

  test('fails open when a caption segment is malformed', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () => json3Response([{ tStartMs: 0, dDurationMs: 1_000, segs: [{ utf8: 42 }] }]),
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Malformed caption data');
  });

  test('fails open when a word offset falls outside its cue', async () => {
    const source = new YoutubeTimedtextSource({
      getTrackUrl: () => trackUrl(),
      fetch: async () =>
        json3Response([
          {
            tStartMs: 0,
            dDurationMs: 1_000,
            segs: [{ utf8: 'дурак', tOffsetMs: -1 }],
          },
        ]),
    });

    await expect(source.bind(createOptions([]))).rejects.toThrow('Malformed caption data');
  });
});
