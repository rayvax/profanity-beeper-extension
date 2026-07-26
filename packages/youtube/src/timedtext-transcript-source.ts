import type { TranscriptSession, TranscriptSource, TranscriptSourceOptions } from '@beeper/core';

import { getCaptionTextDelta } from './caption-text-delta';
import {
  fetchCaptionTracksViaInnerTube,
  fetchCuesForTrack,
  getInnerTubeApiKey,
} from './fetch-caption-tracks';
import type { TimedTextCue } from './parse-json3-cues';
import { getCaptionTracksFromPlayerResponse, getVideoIdFromUrl } from './page-bridge';
import { PlayerSelector } from './selectors';
import { selectCaptionTrack } from './select-caption-track';
import { findElement } from './shared';

const LOG_PREFIX = '[TimedText]';
const VIDEO_WAIT_MS = 10_000;

function findActiveCue(cues: TimedTextCue[], currentTimeMs: number): TimedTextCue | null {
  for (const cue of cues) {
    if (currentTimeMs >= cue.startMs && currentTimeMs < cue.endMs) {
      return cue;
    }
  }

  return null;
}

async function resolveCaptionCues(videoId: string, signal?: AbortSignal): Promise<TimedTextCue[]> {
  let tracks = getCaptionTracksFromPlayerResponse();

  if (!tracks.length) {
    const apiKey = getInnerTubeApiKey();
    if (!apiKey) {
      throw new Error('No caption tracks and no InnerTube API key');
    }

    tracks = await fetchCaptionTracksViaInnerTube(videoId, apiKey, signal);
  }

  if (!tracks.length) {
    throw new Error('No caption tracks found');
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const track = selectCaptionTrack(tracks);
  if (!track) {
    throw new Error('No caption track selected');
  }

  console.info(`${LOG_PREFIX} selected track`, {
    languageCode: track.languageCode,
    vssId: track.vssId,
    kind: track.kind,
  });

  let result = await fetchCuesForTrack(track, signal);

  if (!result.cues.length) {
    const apiKey = getInnerTubeApiKey();
    if (apiKey) {
      const innerTubeTracks = await fetchCaptionTracksViaInnerTube(videoId, apiKey, signal);
      const innerTubeTrack = selectCaptionTrack(innerTubeTracks) ?? track;
      result = await fetchCuesForTrack(innerTubeTrack, signal);
    }
  }

  if (!result.cues.length) {
    throw new Error(`Caption fetch returned empty (${result.emptyReason ?? 'unknown'})`);
  }

  return result.cues;
}

export class TimedTextTranscriptSource implements TranscriptSource {
  async bind(options: TranscriptSourceOptions): Promise<TranscriptSession> {
    const videoId = getVideoIdFromUrl();
    if (!videoId) {
      throw new Error('No video id in URL');
    }

    const cues = await resolveCaptionCues(videoId, options.signal);

    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const video = await findElement(PlayerSelector.VIDEO, {
      maxWaitMs: VIDEO_WAIT_MS,
      signal: options.signal,
    });

    if (!video) {
      throw new Error('Video element not found');
    }

    const videoElement = video as HTMLVideoElement;
    let lastEmittedText = '';
    let lastCueStartMs = -1;
    let lastTimeSec = 0;
    let destroyed = false;

    const onTimeUpdate = () => {
      if (destroyed) {
        return;
      }

      if (!videoElement.isConnected) {
        options.onDetach?.();
        destroyed = true;
        videoElement.removeEventListener('timeupdate', onTimeUpdate);
        return;
      }

      const currentTimeSec = videoElement.currentTime;
      if (currentTimeSec < lastTimeSec - 0.5) {
        lastEmittedText = '';
        lastCueStartMs = -1;
      }
      lastTimeSec = currentTimeSec;

      const currentTimeMs = currentTimeSec * 1000;
      const activeCue = findActiveCue(cues, currentTimeMs);
      if (!activeCue || activeCue.startMs === lastCueStartMs) {
        return;
      }

      lastCueStartMs = activeCue.startMs;
      const delta = getCaptionTextDelta(lastEmittedText, activeCue.text);
      if (!delta) {
        return;
      }

      lastEmittedText = activeCue.text;
      options.onChunk({ text: delta });
    };

    videoElement.addEventListener('timeupdate', onTimeUpdate);
    onTimeUpdate();

    return {
      stop: () => {
        if (destroyed) {
          return;
        }
        destroyed = true;
        videoElement.removeEventListener('timeupdate', onTimeUpdate);
        lastEmittedText = '';
        lastCueStartMs = -1;
      },
    };
  }
}
