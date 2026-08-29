import type { TranscriptSession, TranscriptSource, TranscriptSourceOptions } from '@beeper/core';

import { CueScheduler } from './cue-scheduler';
import {
  fetchCaptionTracksViaInnerTube,
  fetchCuesForTrack,
  getInnerTubeApiKey,
} from './fetch-caption-tracks';
import type { TimedTextCue } from './timed-text-cue';
import { getVideoIdFromUrl } from './get-video-id-from-url';
import { getCaptionTracksFromPlayerResponse } from './page-bridge';
import { PlayerSelector } from './selectors';
import { selectCaptionTrack } from './select-caption-track';
import { findElement } from './shared';

const LOG_PREFIX = '[TimedText]';
const VIDEO_WAIT_MS = 10_000;
const SEEK_BACKWARD_SEC = 0.5;
const SEEK_FORWARD_SEC = 1;

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
    let lastTimeSec = videoElement.currentTime;
    let destroyed = false;

    const scheduler = new CueScheduler({
      cues,
      getCurrentTimeMs: () => videoElement.currentTime * 1000,
      isPaused: () => videoElement.paused,
      onChunk: options.onChunk,
    });

    const onTimeUpdate = () => {
      if (destroyed) {
        return;
      }

      if (!videoElement.isConnected) {
        options.onDetach?.();
        destroyed = true;
        scheduler.stop();
        videoElement.removeEventListener('timeupdate', onTimeUpdate);
        videoElement.removeEventListener('play', onPlay);
        videoElement.removeEventListener('pause', onPause);
        return;
      }

      const currentTimeSec = videoElement.currentTime;

      if (
        currentTimeSec < lastTimeSec - SEEK_BACKWARD_SEC ||
        currentTimeSec > lastTimeSec + SEEK_FORWARD_SEC
      ) {
        scheduler.onSeek();
      }

      lastTimeSec = currentTimeSec;
    };

    const onPlay = () => {
      scheduler.onPlay();
    };

    const onPause = () => {
      scheduler.onPause();
    };

    videoElement.addEventListener('timeupdate', onTimeUpdate);
    videoElement.addEventListener('play', onPlay);
    videoElement.addEventListener('pause', onPause);
    scheduler.start();

    return {
      stop: () => {
        if (destroyed) {
          return;
        }
        destroyed = true;
        scheduler.stop();
        videoElement.removeEventListener('timeupdate', onTimeUpdate);
        videoElement.removeEventListener('play', onPlay);
        videoElement.removeEventListener('pause', onPause);
      },
    };
  }
}
