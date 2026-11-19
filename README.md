# codeshare

Share a link, code together live. Open any URL like `/my-room` and you're in a room anyone with the link can edit.

**Live:** https://harveycodes.com

Built for small coding classes: live editing with named cursors, syntax highlighting, images and files shared in a sidebar, and rooms that delete themselves 2 weeks after the last edit. No accounts.

## How it works

- **Frontend:** Vite + React + TypeScript, CodeMirror 6
- **Sync:** Yjs (a CRDT) over WebSockets, via `y-partyserver`
- **Backend:** one Cloudflare Durable Object per room. It holds the live connections, and stores the document, images and files in its own SQLite. It hibernates when idle and deletes itself with an alarm 2 weeks after the last edit
- **Cost:** runs entirely on the Cloudflare Workers free plan
- **Tests:** Vitest (unit) and Playwright (two-browser sync tests)

## Why a CRDT (LWW vs Yjs)

My first version sent the whole document on every keystroke, and the last write won. When two people typed at once, their messages crossed, each screen overwrote the other's keystroke, and they ended up with different text. A CRDT sends small operations anchored to stable character IDs instead, so edits merge in any order and everyone converges. The same Playwright test fails on the first version and passes on the second. Details in [docs/notes/lww.md](docs/notes/lww.md).

## In a room

- **Several files** per room as tabs (up to 10). The language follows the file extension.
- **Run**: JavaScript and Python (Pyodide) run in a sandboxed frame in the browser, with a Stop button and an input box for `input()` / `prompt()`. HTML files open a live preview that pulls in the room's CSS and JS files.
- **History**: the room saves a copy every 5 minutes (last 30). Anyone can preview and restore one.
- **View-only links**: an encrypted token that lets people watch live without being able to edit, and without revealing the editable link.
- **Follow**: click a name to keep your screen on their file and scroll position. **Raise hand** shows a ✋ by your name.
- **Explain**: an AI explanation of the selection or file (Workers AI, rate-limited per room).
- Text size buttons, download a file, copy code.

- **Python `input()`** pauses the program and you type the answer in the output, like a terminal (Chrome/Edge; other browsers use an answers box filled in before Run).
- **Python `turtle`** works like desktop Python: `import turtle` draws on a canvas under the code, animated at the usual speeds (src/run/turtle.py). Keys, clicks, drags and timers work too (`onkey`, `onclick`, `ondrag`, `ontimer`), including `while True: screen.update()` game loops (Chrome/Edge).
- **harveycodes.com** opens the shared room `/now`. New rooms start with `notes.md`; Run shows Markdown formatted.

## Admin

`/admin` lists rooms (people online, size, files, last edit, expiry) with total storage, and can **End** a session (disconnects everyone, keeps the content) or **Delete** a room. It's protected by the `ADMIN_TOKEN` secret: `npx wrangler secret put ADMIN_TOKEN`. Rooms are listed by a small `Directory` Durable Object they report to; rooms made before it existed appear once they're used again.

Setup for view-only links: `npx wrangler secret put VIEW_KEY` with a random base64 value (and the same in `.dev.vars` for local dev).

## Tools

[harveycodes.com/tools](https://harveycodes.com/tools) has 16 small tools with search, categories and favourites (remembered in the browser, no accounts). Every tool runs entirely in the browser and is its own lazy-loaded chunk, so code rooms never download them.

| Group | Tools |
|---|---|
| Teach | Whiteboard ([Excalidraw](https://github.com/excalidraw/excalidraw), MIT), Python playground (Pyodide), class picker & timer, QR code |
| Code | JSON formatter, diff checker, regex tester, encode & decode (Base64 / URL / HTML / JWT), IDs, passwords & hashes, timestamp converter, Markdown to PDF |
| Image | Compressor & converter (PNG / JPEG / WebP), resize & crop, background remover ([BiRefNet_lite](https://github.com/ZhengPeng7/BiRefNet), MIT, [512×512 export](https://huggingface.co/studioludens/birefnet-lite-512)) |
| Colour | Picker, HEX/RGB/HSL, palette, WCAG contrast checker |
| Files | PDF merge, extract pages, images to PDF ([pdf-lib](https://github.com/Hopding/pdf-lib), MIT) |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run e2e        # browser tests
npm run deploy     # deploy to Cloudflare
```

## Limits

200k characters per doc, 20 images per room (≤1.5 MB each, PNG/JPEG/WebP/GIF), files up to 100 MB each (300 MB per room, always downloaded, never opened inline), 50 people per room, and message rate limits. Rooms expire 2 weeks after the last edit.

Design notes: [docs/design.md](docs/design.md)