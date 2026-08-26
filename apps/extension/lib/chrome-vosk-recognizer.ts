import { getVoskContentRecognizer } from '@beeper/adapter-vosk-content';
import type { SpeechRecognizer } from '@beeper/adapter-chrome-content';

export function getChromeVoskRecognizer(): SpeechRecognizer {
  return getVoskContentRecognizer({
    modelUrl: chrome.runtime.getURL('model/model.tar.gz'),
    sandboxUrl: chrome.runtime.getURL('sandbox.html'),
  });
}
