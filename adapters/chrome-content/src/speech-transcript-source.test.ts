import { describe, expect, mock, test } from 'bun:test';
import type { SpeechRecognitionOptions, SpeechRecognizer } from '@beeper/speech';

import { SpeechTranscriptSource } from './speech-transcript-source';

describe('SpeechTranscriptSource', () => {
  test('forwards timed partial words for early ML censorship', async () => {
    let recognitionOptions: SpeechRecognitionOptions | undefined;
    const recognizer: SpeechRecognizer = {
      preload: mock(async () => {}),
      recognize: mock(async (options) => {
        recognitionOptions = options;
        return { stop: mock(() => {}) };
      }),
    };
    const media = {} as HTMLMediaElement;
    const onChunk = mock(() => {});
    const source = new SpeechTranscriptSource(recognizer, () => media);
    await source.bind({ onChunk });

    recognitionOptions?.onResult({
      final: false,
      words: [{ text: 'дурак', startTime: 4, endTime: 5 }],
    });

    expect(onChunk).toHaveBeenCalledWith({
      text: 'дурак',
      startTime: 4,
      endTime: 5,
      final: false,
    });
  });
});
