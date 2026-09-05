# Use a timed transcript at the censor boundary

Every `TranscriptSource` produces transcript chunks with text and start/end positions on the `HTMLMediaElement.currentTime` timeline. The Chunk matcher evaluates this common representation and the shared Censor executor schedules effect windows from it, isolating both from whether content came from YouTube timedtext or local speech recognition.

The executor schedules a replaceable Censor effect rather than hard-coding a beep. The initial effect mutes original audio and overlays a beep in the same `AudioContext`; silence implements the same contract without changing sources, matching, or scheduling.

`@beeper/core` owns `CensorExecutor`, `CensorRange`, and `CensorEffect`; the audio package depends on these shared contracts. Both timedtext and ML session executors expose required `stop` and `onError` methods. Their typed `activation` distinguishes lazy activation on execute from activation on page interaction, with `arm` required for the latter. The session needs no source-specific flag or runtime method detection. Provisional range metadata remains optional for recognition sources that revise timing.

The ML composition accepts an optional `SpeechAudioInput`. Its default is the delayed playback graph's PCM tap; alternative sample inputs can be injected without changing `SpeechTranscriptSource` or the recognizer contract.
