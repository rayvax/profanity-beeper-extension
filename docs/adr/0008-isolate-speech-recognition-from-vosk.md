# Isolate speech recognition from Vosk

`@beeper/speech` owns the speech-recognition contract and `@beeper/vosk` implements it for the bundled Vosk model and its WASM sandbox protocol. Vosk is the only initial implementation, but the content adapter depends on the contract so another local recognizer can replace it without changing the censor pipeline.
