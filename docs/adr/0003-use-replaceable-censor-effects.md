# Use replaceable censor effects

The Censor executor schedules a Censor effect rather than hard-coding a beep. The initial effect mutes original audio and overlays a beep in the same `AudioContext`; silence implements the same contract later without changing sources, lexicons, or scheduling.
