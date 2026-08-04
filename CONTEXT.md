# Youtube Beeper

Chrome extension that detects profanity in YouTube captions and signals the player (mute + flash).

## Language

**Transcript source**:
The origin of caption text fed into the beeper pipeline. A `TranscriptSource` binds to a watch page and emits transcript chunks. TimedText is the active implementation; the DOM bridge is legacy and not a design constraint for matching.
_Avoid_: Caption provider, word source

**Transcript chunk**:
An incremental delta of caption text — only the new characters/words since the previous chunk, not the full visible caption line. Carried on the `CHUNK_CAPTURED` message as `text`.
_Avoid_: Segment, cue (when meaning the full timedtext cue), word

**Transcript session**:
A bound connection to a transcript source for one watch-page navigation. Started by `bind`, ended by `stop`.
_Avoid_: Caption session (legacy DOM term — retire with DOM source)

**Source selection**:
Which `TranscriptSource` implementation is active for a page. #2 wires one source at the entrypoint. Future: popup toggle (caption vs ML) chooses the source before passing it to `startCaptionBeeper` — the seam itself stays single-source; selection lives above it.
_Avoid_: Fallback chain, provider mode

**Player indicator**:
On-screen status glyph mounted on the YouTube player. OOP class with explicit states (`loading`, `working`, `error`) — preferred pattern for UI components in this project.
_Avoid_: Mount helper with inline style mutations

**Stateful components**:
Classes are the preferred pattern for components that hold mutable state or lifecycle (`Messaging`, `CueScheduler`, `PlayerIndicator`, `TranscriptSource` implementations). Use a factory function only when the object is stateless or a thin wrapper over platform APIs.
_Avoid_: `create*` factories for stateful objects

**Censor token**:
YouTube's bracketed placeholder in auto-censored captions (e.g. `[ __ ]`). Detected by pattern rules in the match config.
_Avoid_: Trigger word (when meaning only the YouTube artifact), profanity

**Censor response**:
Mute, flash, and beep fired when a transcript chunk matches the active match config. Signaled by `CHUNK_CENSORED`.
_Avoid_: Word censored, profanity detected

**Blocked term**:
A string that triggers the censor response when matched in transcript text. Used for uncensored sources (e.g. speech-to-text) where YouTube does not insert censor tokens. Matched with case-insensitive word boundaries.
_Avoid_: Trigger word (when meaning user list entry), bad word, filter word

**Match rule**:
One entry in the match config — either a pattern rule (regular expression) or a blocked term (literal string).
_Avoid_: Trigger word

**Pattern rule**:
A case-insensitive regular expression in the match config. A chunk matches if the regex matches any substring of the chunk. Used for censor tokens and similar artifacts.
_Avoid_: Trigger pattern, filter pattern

**Match config**:
Runtime word list driving the unified matcher — pattern rules (censor tokens) plus blocked terms. Matching is per-chunk and stateless; each transcript chunk is classified independently. Defaults live as remote JSON on GitHub (`master`) at `config/match-defaults/{lang}.json` (e.g. `en.json`, `ru.json`). Refetch only when the latest commit SHA touching config files changes. Active language: browser locale with fallback to `en`. A per-language saved local copy in `chrome.storage.local` is a frozen snapshot until the user resets that language to defaults. Future popup edits the same per-language storage keys and shares the settings surface with source selection.
_Avoid_: Trigger word list, profanity filter config
