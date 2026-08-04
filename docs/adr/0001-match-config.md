# Match config: remote defaults, per-language local override, SW classification

Youtube Beeper must detect both YouTube censor tokens (`[ __ ]`) in censored captions and literal blocked terms in future uncensored speech-to-text output. We use a unified, stateless per-chunk matcher in `@beeper/core` (regex pattern rules + word-boundary blocked terms). Classification stays in the service worker; content scripts emit `CHUNK_CAPTURED` with `{ text }` and react to `censored: true` / `CHUNK_CENSORED`.

Defaults live on GitHub (`master`) at `config/match-defaults/{lang}.json`. The SW refetches only when the latest commit SHA touching `config/` changes (not on a timer alone). Active language is the browser locale with fallback to `en`. If the user has not saved a per-language override, remote JSON is authoritative. Saving in popup (deferred) writes a frozen full snapshot to `chrome.storage.local`; reset deletes that language's user entry and returns to remote. Storage shape: `matchConfigMeta.configSha` plus `matchConfig.remote[lang]` (cache) and `matchConfig.user[lang]` (override). Invalid regex patterns are skipped with a warning, not a hard fail.

## Considered Options

- **Additive merge** (remote terms + local terms) — rejected in favour of full per-language override with explicit reset.
- **Rolling buffer matching** — rejected; TimedText/ML chunks are sufficient for stateless per-chunk matching. DOM transcript source is legacy and not a design constraint.
- **Content-script classification** — rejected; SW centralises GitHub fetch, SHA polling, and storage.
- **Tag-pinned remote URL** — rejected; `master` with SHA-change detection so config updates ship without an extension release.

## Consequences

- Phase B ships matcher + remote + storage plumbing; popup UI is a later phase on the same storage contract.
- `@beeper/core` stays free of `chrome.*`; config resolution lives in the extension/adapter layer.
- `WORD_CAPTURED` / `WORD_CENSORED` rename to `CHUNK_CAPTURED` / `CHUNK_CENSORED`.
