# Youtube Beeper

Chrome extension that detects profanity in YouTube captions and signals the player (mute + flash).

## Language

**Transcript source**:
The origin of caption text fed into the beeper pipeline. A `TranscriptSource` binds to a watch page and emits transcript chunks. Multiple implementations can exist behind the same seam; #2 ships a DOM bridge, timedtext is deferred (#3).
_Avoid_: Caption provider, word source

**Transcript chunk**:
An incremental delta of caption text — only the new characters/words since the previous chunk, not the full visible caption line.
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
