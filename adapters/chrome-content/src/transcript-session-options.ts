import { CensorAudioExecutor, DelayedCensoredPlayback } from '@beeper/audio';
import {
  createChunkMatcherFromSettings,
  type CensorRange,
  type CensorSettings,
} from '@beeper/core';
import type { SpeechRecognizer } from '@beeper/speech';
import { DelayedVideoRenderer, findPlayerMedia, YoutubeTimedtextSource } from '@beeper/youtube';

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
  const executor = new CensorAudioExecutor(findPlayerMedia, {
    effect: settings.effect,
  });
  const sessionOptions: TimedCensorSessionOptions = {
    source: new YoutubeTimedtextSource(),
    matcher: createChunkMatcherFromSettings(settings),
    executor,
    updateSettings(nextSettings) {
      sessionOptions.matcher = createChunkMatcherFromSettings(nextSettings);
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
  const playback = new DelayedCensoredPlayback(findPlayerMedia, {
    delaySeconds: settings.delaySeconds,
    effect: settings.effect,
    workletUrl: mlOptions.workletUrl,
  });
  const executor = new MlCensorExecutor(findPlayerMedia, playback, settings.delaySeconds);
  const sessionOptions: TimedCensorSessionOptions = {
    source: new SpeechTranscriptSource(mlOptions.recognizer, findPlayerMedia, playback.audioInput),
    matcher: createChunkMatcherFromSettings(settings),
    executor,
    armOnInteraction: true,
    onTranscript: mlOptions.onTranscript,
    updateSettings(nextSettings) {
      sessionOptions.matcher = createChunkMatcherFromSettings(nextSettings);
      playback.updateOptions({
        delaySeconds: nextSettings.delaySeconds,
        effect: nextSettings.effect,
      });
      executor.updateDelay(nextSettings.delaySeconds);
    },
    onStatus,
  };
  return sessionOptions;
}

export type MlPlaybackExecutor = {
  execute(range: CensorRange): Promise<void>;
  arm(): Promise<void>;
  onError(listener: (error: unknown) => void): () => void;
  stop(): void;
};

export class MlCensorExecutor implements MlPlaybackExecutor {
  private renderer: DelayedVideoRenderer | undefined;
  private readonly failureListeners = new Set<(error: unknown) => void>();
  private readonly rendererOptions: { delaySeconds: number; onError(error: unknown): void };

  constructor(
    private readonly getMedia: () => HTMLMediaElement | null,
    private readonly playback: DelayedCensoredPlayback,
    delaySeconds: number,
  ) {
    this.rendererOptions = {
      delaySeconds,
      onError: (error) => this.fail(error),
    };
  }

  execute(range: CensorRange): Promise<void> {
    return this.playback.execute(range);
  }

  async arm(): Promise<void> {
    await this.playback.arm();
    const media = this.getMedia();
    if (!(media instanceof HTMLVideoElement)) {
      this.playback.stop();
      throw new Error('Player video not found');
    }
    this.renderer?.stop();
    this.renderer = new DelayedVideoRenderer(media, this.rendererOptions);
  }

  onError(listener: (error: unknown) => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  stop(): void {
    this.renderer?.stop();
    this.renderer = undefined;
    this.playback.stop();
  }

  updateDelay(delaySeconds: number): void {
    this.rendererOptions.delaySeconds = delaySeconds;
  }

  private fail(error: unknown): void {
    this.renderer?.stop();
    this.renderer = undefined;
    this.playback.stop();
    this.failureListeners.forEach((listener) => listener(error));
  }
}
