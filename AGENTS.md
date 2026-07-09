# Agent Guidelines

**Always use Bun** for installs, scripts, and package management — not npm or pnpm.

## Repository purpose

Bun monorepo for **Youtube Beeper** — a Manifest V3 Chrome extension that detects profanity in YouTube captions and signals the player (mute + flash). Offscreen audio beep support is wired but currently stubbed in the service worker (same as the source example).

## Structure

| Path | Package | Role |
|------|---------|------|
| `apps/extension` | `@beeper/extension` | WXT app — thin Chrome entrypoints, `wxt.config.ts` |
| `packages/core` | `@beeper/core` | Message protocol (`MessageType` const objects), trigger-word matching |
| `packages/youtube` | `@beeper/youtube` | Caption DOM observer, `signalPlayer` (no `chrome.*`) |
| `packages/audio` | `@beeper/audio` | Web Audio beep (no `chrome.*`) |
| `adapters/chrome-sw` | `@beeper/adapter-chrome-sw` | Service worker handlers, offscreen lifecycle |
| `adapters/chrome-content` | `@beeper/adapter-chrome-content` | Content script orchestration |

Pure capabilities live in `packages/*` (no `chrome.*`). Chrome extension wiring lives in `adapters/*`. `apps/extension/entrypoints/` only wires WXT entrypoints to adapters.

## Conventions

- **No TypeScript `enum`** — use `as const` objects (e.g. `MessageType`, `CaptionSelector`)
- **No default exports** — named exports only (WXT entrypoints use `export default defineBackground` etc.)
- **Don't delete existing comments** unless explicitly asked
- **Message constants** live in `packages/core/src/messages.ts`
- **SW handlers** live in `adapters/chrome-sw`

## Commands

```bash
bun install          # root — installs all workspaces
bun run build        # outputs to apps/extension/dist/chrome-mv3
bun run dev          # WXT dev server with HMR
```

Load unpacked extension in Chrome from `apps/extension/dist/chrome-mv3`.

## Package dependency graph

```
@beeper/extension              →  adapter-chrome-sw, adapter-chrome-content, audio, core
@beeper/adapter-chrome-sw      →  core
@beeper/adapter-chrome-content →  core, youtube
@beeper/youtube                →  (none)
@beeper/audio                  →  (none)
@beeper/core                   →  (none)
```

## When adding features

- New message types → `packages/core/src/messages.ts`
- YouTube DOM logic → `packages/youtube`
- Audio processing → `packages/audio`
- Chrome orchestration → `adapters/*`
- New entrypoint → `apps/extension/entrypoints/` + manifest options in entrypoint or `wxt.config.ts`
