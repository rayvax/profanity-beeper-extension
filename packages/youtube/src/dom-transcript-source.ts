import type { TranscriptSession, TranscriptSource, TranscriptSourceOptions } from '@beeper/core';

import { DomCaptionObserver } from './dom-caption-observer';

const CAPTION_WAIT_MS = 10_000;

export class DomTranscriptSource implements TranscriptSource {
  async bind(options: TranscriptSourceOptions): Promise<TranscriptSession> {
    const observer = await DomCaptionObserver.start(
      (text) => {
        options.onChunk({ text });
      },
      {
        maxWaitMs: CAPTION_WAIT_MS,
        signal: options.signal,
        onDetach: options.onDetach,
      },
    );

    return {
      stop: () => observer.stop(),
    };
  }
}
