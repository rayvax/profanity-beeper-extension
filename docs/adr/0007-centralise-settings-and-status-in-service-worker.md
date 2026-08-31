# Centralise settings and status in the service worker

The service worker owns persisted global Censor settings and per-tab Censor status. It receives popup changes, broadcasts settings to active content sessions, receives their status, and updates the tab-specific extension action; Chrome API use stays inside `apps/extension`.
