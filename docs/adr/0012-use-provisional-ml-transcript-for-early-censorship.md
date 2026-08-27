# Use provisional ML transcript for early censorship

Vosk Final transcript can arrive only after an utterance boundary, later than the configurable playback delay for long phrases. ML mode therefore also emits newly observed tokens from Vosk's provisional text as Timed transcript chunks. Their conservative range is anchored to `HTMLMediaElement.currentTime`, with a short lookback and lookahead, so the Censor executor can act before delayed playback reaches the viewer.

Final transcript remains authoritative and carries Vosk's exact word timing. When its normalised Censor token matches a pending Provisional transcript token, the pending estimated window is replaced by the Final interval before it reaches delayed playback. Provisional tokens can be revised, are deduplicated by their common prefix, and are distinguished from Final transcript in popup diagnostics. Exact Censor-token matching limits the effect of unstable partial hypotheses.
