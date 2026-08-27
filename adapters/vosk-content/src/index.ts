import type { SpeechRecognizer } from '@beeper/speech';
import {
  createVoskSandboxSpeechRecognizer,
  type VoskSandboxSpeechRecognizerOptions,
} from '@beeper/vosk';

let recognizer: SpeechRecognizer | undefined;

export function getVoskContentRecognizer(
  options: VoskSandboxSpeechRecognizerOptions,
): SpeechRecognizer {
  if (recognizer) return recognizer;

  recognizer = createVoskSandboxSpeechRecognizer(options);
  // The page-scoped model load must outlive individual Censor sessions.
  void recognizer.preload().catch(() => undefined);
  return recognizer;
}
