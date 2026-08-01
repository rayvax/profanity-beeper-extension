import { createBeepCensorExecutor } from '@beeper/audio';
import { createDefaultRussianCensorLexicon } from '@beeper/core';
import { PlayerSelector, YoutubeTimedtextSource } from '@beeper/youtube';

import type { TimedCensorSessionOptions } from './caption-beeper';

export function createTimedCaptionSessionOptions(): TimedCensorSessionOptions {
  return {
    source: new YoutubeTimedtextSource(),
    lexicon: createDefaultRussianCensorLexicon(),
    executor: createBeepCensorExecutor(findPlayerMedia),
    settings: { enabled: true },
  };
}

function findPlayerMedia(): HTMLMediaElement | null {
  const media = document.querySelector(PlayerSelector.VIDEO);
  return media instanceof HTMLMediaElement ? media : null;
}
