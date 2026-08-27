# Use a timed transcript at the censor boundary

Every `TranscriptSource` produces transcript chunks with text and start/end positions on the `HTMLMediaElement.currentTime` timeline. The Censor lexicon evaluates this common representation and the shared Censor executor schedules beep windows from it, isolating both from whether content came from YouTube timedtext or local speech recognition.
