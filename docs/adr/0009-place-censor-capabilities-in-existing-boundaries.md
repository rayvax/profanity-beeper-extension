# Place censor capabilities in existing package boundaries

`@beeper/core` owns timed transcript and lexicon matching, `@beeper/audio` owns Web Audio effects, `@beeper/youtube` owns YouTube timedtext and delayed video, and `@beeper/adapter-chrome-content` composes their lifecycle. This preserves pure capabilities and Chrome-free orchestration; `apps/extension` remains the only Chrome API boundary.
