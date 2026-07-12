# Agent Guidelines

**Always use Bun** for installs, scripts, and package management — not npm or pnpm.

## Repository purpose

Bun monorepo for **Youtube Beeper** — a Manifest V3 Chrome extension that detects profanity in YouTube captions and signals the player (mute + flash). Offscreen audio beep support is wired but currently stubbed in the service worker (same as the source example).

## Structure

| Path | Package | Role |
|------|---------|------|
| `apps/extension` | `@beeper/extension` | WXT app — Chrome API ports (`lib/chrome-*`), thin entrypoint wiring |
| `packages/core` | `@beeper/core` | Message protocol (`MessageType` const objects), trigger-word matching |
| `packages/youtube` | `@beeper/youtube` | Caption DOM observer, `signalPlayer` (no `chrome.*`) |
| `packages/audio` | `@beeper/audio` | Web Audio beep (no `chrome.*`) |
| `adapters/chrome-sw` | `@beeper/adapter-chrome-sw` | Service worker handlers, censor audio handler |
| `adapters/chrome-content` | `@beeper/adapter-chrome-content` | Content script orchestration |

Pure capabilities live in `packages/*` (no `chrome.*`). Orchestration lives in `adapters/*` (no `chrome.*`). Chrome APIs live in `apps/extension` only. Entrypoints wire adapters with injected messaging.

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
bun run typecheck    # TypeScript check across all workspace packages
bun run lint         # oxlint — boundaries, imports, conventions
bun run lint:fix     # oxlint auto-fix
bun run format       # oxfmt check
bun run format:fix   # oxfmt apply
```

Load unpacked extension in Chrome from `apps/extension/dist/chrome-mv3`.

## Before finishing

After making code changes:

1. Run `bun run typecheck` and `bun run lint` **in parallel**.
2. Fix any errors (`lint:fix` where applicable, otherwise manual fixes).
3. Repeat steps 1–2 until both pass.
4. Run `bun run format:fix`, then `bun run format` to verify.

Do not consider the job done until all checks pass.

## Package dependency graph

```
@beeper/extension              →  adapter-chrome-sw, adapter-chrome-content
@beeper/adapter-chrome-sw      →  core, audio
@beeper/adapter-chrome-content →  core, youtube
@beeper/youtube                →  (none)
@beeper/audio                  →  (none)
@beeper/core                   →  (none)
```

## When adding features

- New message types → `packages/core/src/messages.ts`
- YouTube DOM logic → `packages/youtube`
- Audio processing → `packages/audio`
- Chrome API ports → `apps/extension/lib/`
- Handler orchestration → `adapters/*`
- New entrypoint → `apps/extension/entrypoints/` + manifest options in entrypoint or `wxt.config.ts`
