import type { CaptionTrack } from './caption-track';
import { getMoviePlayer } from './page-bridge';

function normalizeTrackCandidate(track: unknown): Partial<CaptionTrack> | null {
  if (!track || typeof track !== 'object') {
    return null;
  }

  const value = track as Record<string, unknown>;

  return {
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    languageCode: typeof value.languageCode === 'string' ? value.languageCode : '',
    languageName:
      typeof value.displayName === 'string'
        ? value.displayName
        : typeof value.name === 'object' &&
            value.name !== null &&
            'simpleText' in value.name &&
            typeof (value.name as { simpleText?: string }).simpleText === 'string'
          ? (value.name as { simpleText: string }).simpleText
          : typeof value.languageCode === 'string'
            ? value.languageCode
            : '',
    vssId: typeof value.vssId === 'string' ? value.vssId : undefined,
    kind: typeof value.kind === 'string' ? value.kind : undefined,
  };
}

function browserLanguagePrefix(): string {
  const language = navigator.language || navigator.languages?.[0] || 'en';
  return language.split('-')[0].toLowerCase();
}

function matchesBrowserLanguage(track: CaptionTrack, languagePrefix: string): boolean {
  return track.languageCode.toLowerCase().startsWith(languagePrefix);
}

export function selectCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) {
    return null;
  }

  const player = getMoviePlayer();

  try {
    const currentTrack = normalizeTrackCandidate(player?.getOption?.('captions', 'track'));

    if (currentTrack) {
      const exactByBaseUrl = tracks.find(
        (track) => currentTrack.baseUrl && track.baseUrl === currentTrack.baseUrl,
      );
      if (exactByBaseUrl) {
        return exactByBaseUrl;
      }

      const byVssId = tracks.find(
        (track) => currentTrack.vssId && track.vssId && track.vssId === currentTrack.vssId,
      );
      if (byVssId) {
        return byVssId;
      }

      const byLanguage = tracks.find(
        (track) => currentTrack.languageCode && track.languageCode === currentTrack.languageCode,
      );
      if (byLanguage) {
        return byLanguage;
      }
    }
  } catch {
    // Player option read failed — fall through to defaults.
  }

  const languagePrefix = browserLanguagePrefix();
  const asrInLanguage = tracks.find(
    (track) => track.kind === 'asr' && matchesBrowserLanguage(track, languagePrefix),
  );
  if (asrInLanguage) {
    return asrInLanguage;
  }

  return tracks[0];
}
