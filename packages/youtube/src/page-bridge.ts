import type { CaptionTrack } from './caption-track';

const LOG_PREFIX = '[TimedText][bridge]';

type PlayerResponseWindow = Window & {
  ytInitialPlayerResponse?: unknown;
};

type MoviePlayer = {
  getPlayerResponse?: () => unknown;
  getOption?: (module: string, option: string) => unknown;
};

function readSimpleOrRunText(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'object' && value !== null && 'simpleText' in value) {
    const simpleText = (value as { simpleText?: string }).simpleText;
    if (typeof simpleText === 'string') {
      return simpleText;
    }
  }

  if (typeof value === 'object' && value !== null && 'runs' in value) {
    const runs = (value as { runs?: Array<{ text?: string }> }).runs;
    if (Array.isArray(runs)) {
      return runs
        .map((item) => item?.text ?? '')
        .join('')
        .trim();
    }
  }

  return '';
}

export function getMoviePlayer(): MoviePlayer | null {
  return document.getElementById('movie_player') as MoviePlayer | null;
}

export function getVideoIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get('v');
}

function extractPlayerResponseFromScripts(): unknown | null {
  for (const script of document.scripts) {
    const text = script.textContent ?? '';
    if (!text.includes('ytInitialPlayerResponse')) {
      continue;
    }

    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
    if (!match?.[1]) {
      continue;
    }

    try {
      return JSON.parse(match[1]);
    } catch {
      console.warn(`${LOG_PREFIX} failed to parse ytInitialPlayerResponse from script`);
    }
  }

  return null;
}

export function getPlayerResponse(): unknown | null {
  const player = getMoviePlayer();

  try {
    if (player?.getPlayerResponse) {
      return player.getPlayerResponse();
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} getPlayerResponse via player failed`, error);
  }

  const playerWindow = window as PlayerResponseWindow;
  if (playerWindow.ytInitialPlayerResponse) {
    return playerWindow.ytInitialPlayerResponse;
  }

  return extractPlayerResponseFromScripts();
}

export function extractCaptionTracks(playerResponse: unknown): CaptionTrack[] {
  if (!playerResponse || typeof playerResponse !== 'object') {
    return [];
  }

  const captions = (playerResponse as { captions?: unknown }).captions;
  if (!captions || typeof captions !== 'object') {
    return [];
  }

  const renderer = (captions as { playerCaptionsTracklistRenderer?: unknown })
    .playerCaptionsTracklistRenderer;
  if (!renderer || typeof renderer !== 'object') {
    return [];
  }

  const tracks = (renderer as { captionTracks?: unknown[] }).captionTracks ?? [];

  return tracks
    .filter((track): track is Record<string, unknown> => {
      if (typeof track !== 'object' || track === null) {
        return false;
      }

      return typeof (track as { baseUrl?: unknown }).baseUrl === 'string';
    })
    .map((track) => ({
      baseUrl: track.baseUrl as string,
      languageCode: typeof track.languageCode === 'string' ? track.languageCode : '',
      languageName:
        readSimpleOrRunText(track.name) ||
        (typeof track.languageCode === 'string' ? track.languageCode : ''),
      vssId: typeof track.vssId === 'string' ? track.vssId : undefined,
      kind: typeof track.kind === 'string' ? track.kind : undefined,
    }));
}

export function getCaptionTracksFromPlayerResponse(): CaptionTrack[] {
  return extractCaptionTracks(getPlayerResponse());
}
