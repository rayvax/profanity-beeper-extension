import type { SpeechRecognizer } from '@beeper/speech';
import { VoskSandboxSpeechRecognizer, type VoskSandboxSpeechRecognizerOptions } from '@beeper/vosk';

let recognizer: SpeechRecognizer | undefined;

export function getVoskContentRecognizer(
  options: VoskSandboxSpeechRecognizerOptions,
): SpeechRecognizer {
  if (recognizer) return recognizer;

  recognizer = new VoskSandboxSpeechRecognizer(options);
  // The page-scoped model load must outlive individual Censor sessions.
  void recognizer.preload().catch(() => undefined);
  return recognizer;
}
