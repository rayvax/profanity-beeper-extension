import { describe, expect, test } from 'bun:test';

import type { SpeechRecognitionResult, SpeechRecognizer } from './index';

describe('SpeechRecognizer contract', () => {
  test('represents final timed words independently of a model implementation', () => {
    const result: SpeechRecognitionResult = {
      final: true,
      words: [{ text: 'дурак', startTime: 4.2, endTime: 4.8 }],
    };

    const recognizer: SpeechRecognizer = {
      preload: async () => {},
      recognize: async () => ({ stop() {} }),
    };

    expect(result.final).toBe(true);
    expect(recognizer).toBeDefined();
  });
});
