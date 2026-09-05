# Synchronise ML censored playback

ML recognition is asynchronous, so ML censored playback shifts audio and video by the same configurable delay before delivering them to the viewer. YouTube timedtext playback remains real-time because its timed cues can be scheduled directly. This gives ML recognition time to schedule the censoring window while preserving audio-video synchronisation; real-time ML playback would allow detected profanity to be heard before censorship.
