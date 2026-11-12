# codeshare

Share a link, code together live. Open any URL like `/my-room` and you're in a room anyone with the link can edit.

**Live:** https://harveycodes.com

Built for small coding classes: live editing with named cursors, syntax highlighting, images pasted straight from the clipboard, and rooms that delete themselves 24h after the last edit. No accounts.

## How it works

- **Frontend:** Vite + React + TypeScript, CodeMirror 6
- **Sync:** Yjs (a CRDT) over WebSockets, via `y-partyserver`
- **Backend:** one Cloudflare Durable Object per room. It holds the live connections, and stores the document and images in its own SQLite. It hibernates when idle and deletes itself with an alarm after 24h
- **Cost:** runs entirely on the Cloudflare Workers free plan
- **Tests:** Vitest (unit) and Playwright (two-browser sync tests)

## Why a CRDT (LWW vs Yjs)

My first version sent the whole document on every keystroke, and the last write won. When two people typed at once, their messages crossed, each screen overwrote the other's keystroke, and they ended up with different text. A CRDT sends small operations anchored to stable character IDs instead, so edits merge in any order and everyone converges. The same Playwright test fails on the first version and passes on the second. Details in [docs/notes/lww.md](docs/notes/lww.md).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run e2e        # browser tests
npm run deploy     # deploy to Cloudflare
```

## Limits

200k characters per doc, 20 images per room (≤1.5 MB each, PNG/JPEG/WebP/GIF), 50 people per room, and message rate limits. Rooms expire 24h after the last edit.

Design notes: [docs/design.md](docs/design.md)