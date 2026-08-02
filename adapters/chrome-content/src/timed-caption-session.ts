import { createBeepCensorExecutor, createDelayedCensorExecutor } from '@beeper/audio';
import { createCensorLexiconFromSettings, type CensorSettings } from '@beeper/core';
import type { SpeechRecognizer } from '@beeper/speech';
import { PlayerSelector, YoutubeTimedtextSource } from '@beeper/youtube';

import type { TimedCensorSessionOptions } from './caption-beeper';
import { SpeechTranscriptSource } from './speech-transcript-source';

export function createTimedCaptionSessionOptions(
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
  recognizer: SpeechRecognizer,
  onStatus?: TimedCensorSessionOptions['onStatus'],
): TimedCensorSessionOptions {
  const executor = createBeepCensorExecutor(findPlayerMedia, {
    beep: settings.effect === 'beep',
  });
  return {
    source: new SpeechTranscriptSource(recognizer, findPlayerMedia),
    lexicon: createCensorLexiconFromSettings(settings),
    executor: createDelayedCensorExecutor(executor, { delaySeconds: settings.delaySeconds }),
    settings: { enabled: true },
    onStatus,
  };
}

function findPlayerMedia(): HTMLMediaElement | null {
  const media = document.querySelector(PlayerSelector.VIDEO);
  return media instanceof HTMLMediaElement ? media : null;
}
