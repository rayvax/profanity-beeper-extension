import type { SpeechRecognizer, SpeechRecognitionSession } from '@beeper/speech';
import type { TranscriptSession, TranscriptSource, TranscriptSourceOptions } from '@beeper/core';

export class SpeechTranscriptSource implements TranscriptSource {
  constructor(
    private readonly recognizer: SpeechRecognizer,
    private readonly getMedia: () => HTMLMediaElement | null,
  ) {}

  async bind(options: TranscriptSourceOptions): Promise<TranscriptSession> {
    const media = this.getMedia();
    if (!media) {
      throw new Error('Player media not found');
    }

    await this.recognizer.preload(options.signal);
    let recognition: SpeechRecognitionSession | undefined;
    recognition = await this.recognizer.recognize({
      media,
      signal: options.signal,
      onResult: (result) => {
        if (result.final) {
          result.words.forEach((word) => options.onChunk(word));
        }
      },
      onError: (error) => {
        console.error('[Caption Beeper] speech recognition failed', error);
      },
    });

    return {
      stop() {
        recognition?.stop();
      },
    };
  }
}
