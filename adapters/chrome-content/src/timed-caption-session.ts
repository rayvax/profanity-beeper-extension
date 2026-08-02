import { createBeepCensorExecutor } from '@beeper/audio';
import { createCensorLexiconFromSettings, type CensorSettings } from '@beeper/core';
import { PlayerSelector, YoutubeTimedtextSource } from '@beeper/youtube';

import type { TimedCensorSessionOptions } from './caption-beeper';

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

function findPlayerMedia(): HTMLMediaElement | null {
  const media = document.querySelector(PlayerSelector.VIDEO);
  return media instanceof HTMLMediaElement ? media : null;
}
