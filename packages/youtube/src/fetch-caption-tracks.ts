import type { CaptionTrack } from './caption-track';
import { extractCaptionTracks } from './page-bridge';
import { parseJson3Response, type TimedTextCue } from './parse-json3-cues';

const LOG_PREFIX = '[TimedText][fetch]';
const INNERTUBE_PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player';

type FetchCuesResult = {
  cues: TimedTextCue[];
  emptyReason: 'empty-body' | 'parsed-empty' | 'blocked-html' | null;
};

function toAbsoluteYoutubeUrl(baseUrl: string): URL {
  return new URL(baseUrl, 'https://www.youtube.com');
}

export function buildJson3TrackUrl(baseUrl: string): string {
  const url = toAbsoluteYoutubeUrl(baseUrl);

  if (!url.searchParams.has('fmt')) {
    url.searchParams.set('fmt', 'json3');
  }

  url.searchParams.delete('tlang');

  return url.toString();
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

export function getInnerTubeApiKey(): string | null {
  try {
    const yt = (window as Window & { yt?: { config_?: { INNERTUBE_API_KEY?: string } } }).yt;
    if (yt?.config_?.INNERTUBE_API_KEY) {
      return yt.config_.INNERTUBE_API_KEY;
    }

    const ytcfg = (window as Window & { ytcfg?: { data_?: { INNERTUBE_API_KEY?: string } } }).ytcfg;
    if (ytcfg?.data_?.INNERTUBE_API_KEY) {
      return ytcfg.data_.INNERTUBE_API_KEY;
    }
  } catch {
    // Page globals unavailable in isolated world.
  }

  for (const script of document.querySelectorAll('script')) {
    const match = script.textContent?.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export async function fetchCaptionTracksViaInnerTube(
  videoId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<CaptionTrack[]> {
  const response = await fetch(`${INNERTUBE_PLAYER_URL}?key=${apiKey}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          hl: 'en',
          gl: 'US',
        },
      },
      videoId,
    }),
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    console.warn(`${LOG_PREFIX} InnerTube player failed`, response.status);
    return [];
  }

  const playerData = (await response.json()) as unknown;
  return extractCaptionTracks(playerData);
}

export async function fetchCuesForTrack(
  track: CaptionTrack,
  signal?: AbortSignal,
): Promise<FetchCuesResult> {
  const url = buildJson3TrackUrl(track.baseUrl);
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    signal,
  });

  if (response.status === 429) {
    throw new Error('Subtitle fetch rate limited: 429');
  }

  if (!response.ok) {
    throw new Error(`Subtitle fetch failed: ${response.status}`);
  }

  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return { cues: [], emptyReason: 'empty-body' };
  }

  if (isBlockedHtmlResponse(rawBody)) {
    return { cues: [], emptyReason: 'blocked-html' };
  }

  const cues = parseJson3Response(rawBody);
  return {
    cues,
    emptyReason: cues.length ? null : 'parsed-empty',
  };
}
