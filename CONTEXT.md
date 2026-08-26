# Youtube Beeper

Chrome extension that detects profanity in YouTube captions and signals the player (mute + flash).

## Language

**Transcript source**:
The origin of caption text fed into the beeper pipeline. A `TranscriptSource` binds to a watch page and emits transcript chunks. Multiple implementations can exist behind the same seam.
_Avoid_: Caption provider, word source

**YouTube timedtext source**:
A Transcript source that derives a Timed transcript from YouTube's caption track data. It replaces the DOM-caption reader in caption mode.
_Avoid_: DOM-caption source, visual-caption reader

**Cue censor range**:
The entire timed caption cue selected for censorship when its source lacks per-word timing. It prevents a matched word from escaping at the cost of a longer beep.
_Avoid_: Estimated word range, partial cue beep

**Transcript chunk**:
An incremental span of transcript text with its start and end time in the media timeline. Sources emit only newly observed content, not the full visible caption line.
_Avoid_: Segment, cue (when meaning the full timedtext cue), word

**Transcript session**:
A bound connection to a transcript source for one watch-page navigation. Started by `bind`, ended by `stop`.
_Avoid_: Caption session (legacy DOM term — retire with DOM source)

**Source selection**:
Which `TranscriptSource` implementation is active for a page. The user selects either captions or ML before passing one source to `startCaptionBeeper`; the seam stays single-source and selection lives above it.
_Avoid_: Fallback chain, provider mode

**ML transcript source**:
A `TranscriptSource` that derives transcript chunks from video audio through a local, replaceable speech-recognition model. Vosk is the sole bundled model in the first release; model replacement is a developer-facing contract. It is an alternative to the caption-based source, not their combined mode.
_Avoid_: Hybrid source, caption fallback

**Censor lexicon**:
A replaceable set of rules that identifies transcript content requiring censorship. It has a default Russian preset and user overrides for literal words, whitelist entries, and RegExp; every rule evaluates one normalised timed word.
_Avoid_: Profanity list, bad-word regexes

**Censor token**:
The form of a timed word presented to a Censor lexicon: Unicode-normalised, lowercase, stripped of edge punctuation, and with `ё` folded to `е`.
_Avoid_: Raw recognition word, caption fragment

**Whitelist**:
The Censor token entries that are explicitly exempt from censorship. A Whitelist match takes precedence over every Censor lexicon rule.
_Avoid_: Exception list, negative rule

**Censor executor**:
The shared playback capability that applies censorship for time ranges selected from a timed transcript. It is independent of how the transcript was sourced.
_Avoid_: Source-specific censor, mute handler

**Censor effect**:
A replaceable audible treatment applied by the Censor executor during a censored time range. Beep is the initial effect; silence is an alternative.
_Avoid_: Beep implementation, mute mode

**Censor settings**:
The user's global, persisted choices of transcript source, Censor effect, delay (`1.2 s` default; `0.6–3 s` range), and Censor lexicon. A changed RegExp is validated before it replaces active settings, which apply immediately to the active tab. They are not scoped to a tab.
_Avoid_: Per-tab settings, session-only preferences

**Censor status**:
The per-tab state of a censor session, including waiting for the first page interaction and error. An error restores normal playback and is exposed through the extension action and popup.
_Avoid_: Background error, silent failure

**Timed transcript**:
The sequence of transcript chunks whose text is positioned on the `HTMLMediaElement.currentTime` timeline. All transcript sources produce this form.
_Avoid_: Plain transcript, untimed captions

**Final transcript**:
A timed transcript whose recognised words and time ranges will not be revised by its source. ML mode emits it after an utterance boundary to confirm the recognizer's result and exact word timing.
_Avoid_: Partial result

**Provisional transcript**:
An early ML recognition hypothesis emitted before the utterance ends. Because the bundled browser Vosk wrapper exposes partial text without word timing, newly observed tokens receive a short conservative range anchored to the current media time. It enables censorship before delayed playback reaches the viewer and is visibly distinguished from Final transcript in diagnostics.
_Avoid_: Untimed partial text, final result

**Censored playback**:
ML-source playback whose audio and video are shifted by the same delay so a censoring action can be scheduled before a recognised word reaches the viewer. YouTube timedtext playback remains real-time.
_Avoid_: Delayed audio, unsynchronised playback
