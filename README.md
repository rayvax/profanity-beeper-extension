# Youtube Beeper

Chrome extension (Manifest V3) that watches YouTube captions for trigger words and signals the player — the video mutes briefly and the player flashes red. An offscreen audio beep can also play when a match is found.

## Prerequisites

- [Bun](https://bun.sh/) — package manager and script runner for this monorepo
- Google Chrome or another Chromium-based browser

## Install dependencies

From the repository root:

```bash
bun install
```

## Build

```bash
bun run build
```

The built extension is written to:

```
apps/extension/dist/chrome-mv3
```

## Development

For local development with hot reload:

```bash
bun run dev
```

WXT rebuilds on file changes. After a rebuild, use **Reload** on the extension card in `chrome://extensions` (or refresh the YouTube tab) to pick up changes.

## Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `apps/extension/dist/chrome-mv3` folder (create it first with `bun run build` if it does not exist yet)
5. Confirm **Youtube Beeper** appears in the extensions list

To update after rebuilding, click the reload icon on the extension card.

## Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install all workspace dependencies |
| `bun run build` | Production build to `apps/extension/dist/chrome-mv3` |
| `bun run dev` | Dev server with HMR |
