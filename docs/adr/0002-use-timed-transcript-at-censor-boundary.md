# Use a timed transcript at the censor boundary

Every `TranscriptSource` produces transcript chunks with text and start/end positions on the `HTMLMediaElement.currentTime` timeline. The Chunk matcher evaluates this common representation and the shared Censor executor schedules effect windows from it, isolating both from whether content came from YouTube timedtext or local speech recognition.

The executor schedules a replaceable Censor effect rather than hard-coding a beep. The initial effect mutes original audio and overlays a beep in the same `AudioContext`; silence implements the same contract without changing sources, matching, or scheduling.
