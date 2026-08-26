import { createCensorAudioExecutor, createDelayedCensoredPlayback } from '@beeper/audio';
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
  onTranscript?: TimedCensorSessionOptions['onTranscript'];
};

export function createTimedtextCensorSessionOptions(
  settings: CensorSettings,
  onStatus?: TimedCensorSessionOptions['onStatus'],
): TimedCensorSessionOptions {
  const executor = createCensorAudioExecutor(findPlayerMedia, {
    effect: settings.effect,
  });
  const sessionOptions: TimedCensorSessionOptions = {
    source: new YoutubeTimedtextSource(),
    lexicon: createCensorLexiconFromSettings(settings),
    executor,
    updateSettings(nextSettings) {
      sessionOptions.lexicon = createCensorLexiconFromSettings(nextSettings);
      executor.updateOptions({ effect: nextSettings.effect });
    },
    onStatus,
  };
  return sessionOptions;
}

export function createMlCensorSessionOptions(
  settings: CensorSettings,
  mlOptions: MlCensorSessionOptions,
  onStatus?: TimedCensorSessionOptions['onStatus'],
): TimedCensorSessionOptions {
  const playback = createDelayedCensoredPlayback(findPlayerMedia, {
    delaySeconds: settings.delaySeconds,
    effect: settings.effect,
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
  const rendererOptions = { delaySeconds: settings.delaySeconds, onError: fail };
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
      renderer = createDelayedVideoRenderer(media, rendererOptions);
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
  const sessionOptions: TimedCensorSessionOptions = {
    source: new SpeechTranscriptSource(mlOptions.recognizer, findPlayerMedia, playback.audioInput),
    lexicon: createCensorLexiconFromSettings(settings),
    executor,
    armOnInteraction: true,
    onTranscript: mlOptions.onTranscript,
    updateSettings(nextSettings) {
      sessionOptions.lexicon = createCensorLexiconFromSettings(nextSettings);
      playback.updateOptions({
        delaySeconds: nextSettings.delaySeconds,
        effect: nextSettings.effect,
      });
      rendererOptions.delaySeconds = nextSettings.delaySeconds;
    },
    onStatus,
  };
  return sessionOptions;
}

type MlPlaybackExecutor = {
  arm(): Promise<void>;
  onError(listener: (error: unknown) => void): () => void;
};
