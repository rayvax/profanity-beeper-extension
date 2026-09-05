# Bundle match config defaults

Default Chunk matcher rules live as data in `config/match-defaults/{lang}.json` — the YouTube censor-token pattern (`en`) and the default Russian terms (`ru`) — bundled into `@beeper/core` as `BUNDLED_MATCH_CONFIG` behind every matcher built from Censor settings. Rule updates that do not change matching semantics ship as config edits, not code changes.

This supersedes the service-worker classification path from the original match-config decision (`master`, PR #25): classification moved into the content session because censorship needs timed ranges, which only the content-side Censor executor can schedule (ADR-0002). The remote GitHub refresh, SHA cache, and per-language user overrides are deferred; when they return, they feed `ChunkMatcher` as config data rather than reviving a service-worker match RPC. The removed machinery remains in git history.
