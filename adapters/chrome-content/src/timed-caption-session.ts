import { createBeepCensorExecutor, createDelayedCensoredPlayback } from '@beeper/audio';
import {
  createCensorLexiconFromSettings,
  type CensorExecutor,
  type CensorSettings,
} from '@beeper/core';
import type { SpeechRecognizer } from '@beeper/speech';
import {
  createDelayedVideoRenderer,
  findPlayerMedia,
  YoutubeTimedtextSource,
} from '@beeper/youtube';

import type { TimedCensorSessionOptions } from './caption-beeper';
import { SpeechTranscriptSource } from './speech-transcript-source';

export type MlCensorSessionOptions = {
  workletUrl: string;
  recognizer: SpeechRecognizer;
};

export function createTimedtextCensorSessionOptions(
  settings: CensorSettings,
  onStatus?: TimedCensorSessionOptions['onStatus'],
): TimedCensorSessionOptions {
  return {
    source: new YoutubeTimedtextSource(),
    lexicon: createCensorLexiconFromSettings(settings),
    executor: createBeepCensorExecutor(findPlayerMedia, { beep: settings.effect === 'beep' }),
    settings: { enabled: true },
    onStatus,
  };
}

export function createMlCensorSessionOptions(
  settings: CensorSettings,
  mlOptions: MlCensorSessionOptions,
  onStatus?: TimedCensorSessionOptions['onStatus'],
): TimedCensorSessionOptions {
  const playback = createDelayedCensoredPlayback(findPlayerMedia, {
    delaySeconds: settings.delaySeconds,
    beep: settings.effect === 'beep',
    workletUrl: mlOptions.workletUrl,
  });
  let renderer: ReturnType<typeof createDelayedVideoRenderer> | undefined;
  const failureListeners = new Set<(error: unknown) => void>();
  const fail = (error: unknown) => {
    renderer?.stop();
    renderer = undefined;
    playback.stop();
    failureListeners.forEach((listener) => listener(error));
  };
  const executor: CensorExecutor & MlPlaybackExecutor = {
    execute: (range) => playback.execute(range),
    async arm() {
      await playback.arm();
      const media = findPlayerMedia();
      if (!(media instanceof HTMLVideoElement)) {
        playback.stop();
        throw new Error('Player video not found');
      }
      renderer?.stop();
      renderer = createDelayedVideoRenderer(media, {
        delaySeconds: settings.delaySeconds,
        onError: fail,
      });
    },
    onError(listener) {
      failureListeners.add(listener);
      return () => failureListeners.delete(listener);
    },
    stop() {
      renderer?.stop();
      renderer = undefined;
      playback.stop();
    },
  };
  return {
    source: new SpeechTranscriptSource(mlOptions.recognizer, findPlayerMedia, playback.audioInput),
    lexicon: createCensorLexiconFromSettings(settings),
    executor,
    settings: { enabled: true },
    armOnInteraction: true,
    onStatus,
  };
}

type MlPlaybackExecutor = {
  arm(): Promise<void>;
  onError(listener: (error: unknown) => void): () => void;
};
