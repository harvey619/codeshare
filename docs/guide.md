# codeshare — build guide

**Goal:** a share-a-link code pad where `/anything` is a live room, built milestone by milestone.

**Architecture:** Vite + React SPA served by a Cloudflare Worker. Each room is one Durable Object
(`Room`) that holds the live WebSockets, the document, and its images in its own SQLite, and
deletes itself 24h after the last edit.

**Stack:** TypeScript, Vite, React, CodeMirror 6, Yjs, `partyserver` / `y-partyserver`,
Cloudflare Workers + Durable Objects (free plan), Vitest, Playwright.

**Spec:** [`design.md`](design.md). Read it once before starting. This guide argues from it.

## How to use this guide

- Tick boxes as you go (`- [x]`), commit, push. That's how progress follows you between the
  MacBook Air and the Mac mini. Start every session with `git pull`.
- **📚 Learn first** — read or watch this before the milestone; it's what the milestone teaches.
- **🤝 Claude can write this** — boilerplate that isn't worth learning by typing. Ask for it.
  Everything unmarked is yours to write. Ask for hints, not answers, when stuck.
- **✅ Done when** — the check that proves the milestone works. Don't move on until it passes.
- After each milestone: `/ponytail-review`, then `/code-review`, fix, commit.
- Commit messages: plain, no Claude attribution.

## Global constraints

- Cloudflare **Workers Free** plan only, with no payment method on file. No R2, no KV, no paid features.
- Durable Object storage: **SQLite-backed only** (`new_sqlite_classes` in the migration).
- Room names: `^[a-z0-9-]{1,40}$`.
- Limits come from `shared/limits.ts` (Task 1). Never hard-code a limit anywhere else.
- Desktop and laptop first. No mobile layout work.
- Look: `minimalist-ui`. No 3D, animation libraries, or video.

## Review focus

These are the cases most likely to break for a real user, though the spec doesn't spell them out.
Each one has a test in the milestone that owns it.

1. **Two people typing on the same line at the same moment.** Both screens end with identical
   text. (M2 test, which fails on purpose; M3 makes it pass)
2. **Laptop lid closed or Wi-Fi drops mid-edit.** On reconnect, offline edits merge in, with nothing
   lost or duplicated. (M3)
3. **Everyone leaves, then someone comes back an hour later.** Content is still there, even
   though the room hibernated or was evicted. (M3)
4. **Odd URLs** like `/My Room!`, `/a/b`, a 200-char path, `/favicon.ico`. These clean up to a
   valid room or go to `/`, and static files still load. (M1)
5. **Pasting things that aren't small images**: plain text (normal paste, no upload), a 10 MB
   photo (compressed or clearly refused), an SVG (refused). (M5)

## File map

```
shared/limits.ts          constants, normalizeRoomName, randomRoomName, TokenBucket
shared/limits.test.ts
worker/index.ts           fetch handler: /parties/* → Room, /api/rooms/:room/images* → Room, else assets
worker/room.ts            class Room (Durable Object) — LWW in M2, YServer from M3
worker/images.ts          sniffImageType, images table helpers
worker/images.test.ts
src/main.tsx, src/App.tsx app shell: resolves the room from the URL
src/Editor.tsx            CodeMirror setup (language select, size filter, Yjs binding from M3)
src/lww.ts                M2 only: naive sync client (deleted in M3)
src/presence.ts           local user name + color (localStorage)
src/images.ts             compressImage, uploadImage
src/ImageStrip.tsx        renders Y.Array("images")
e2e/*.spec.ts             Playwright tests
wrangler.jsonc, vite.config.ts, playwright.config.ts
```

---

## Milestone 0: accounts and a deployed "hello" (2–3h)

📚 Learn first: [How Workers work](https://developers.cloudflare.com/workers/reference/how-workers-works/),
[Durable Objects overview](https://developers.cloudflare.com/durable-objects/what-are-durable-objects/).

- [ ] Create a free Cloudflare account. Skip any billing prompts; nothing here needs a card.
- [ ] `npx wrangler login`
- [ ] 🤝 Scaffold Vite + React + TS with `@cloudflare/vite-plugin` into this repo, keeping the
      existing `README.md`, `.gitignore`, and `docs/`. Add Vitest.
- [ ] 🤝 `wrangler.jsonc`:
  ```jsonc
  {
    "name": "codeshare",
    "main": "worker/index.ts",
    "compatibility_date": "2026-10-01",
    "assets": {
      "not_found_handling": "single-page-application",
      "run_worker_first": ["/parties/*", "/api/*"]
    },
    "durable_objects": { "bindings": [{ "name": "Room", "class_name": "Room" }] },
    "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Room"] }]
  }
  ```
- [ ] `npm run dev` shows the React page at `localhost:5173`.
- [ ] `npx wrangler deploy` and open the `*.workers.dev` URL.

✅ Done when the page loads both locally and on your `workers.dev` URL, from both Macs after a `git pull`.

---

## Milestone 1: editor and room URLs (2–3h)

📚 Learn first: [CodeMirror system guide](https://codemirror.net/docs/guide/) (state, view,
transactions, extensions). Skim it; the transaction model matters in M3.

### Task 1: `shared/limits.ts`

**Produces:**
```ts
export const LIMITS = {
  docChars: 200_000, docBytesHard: 1_000_000, msgBytes: 262_144,
  msgsPerSec: 30, msgBurst: 60, connsPerRoom: 50,
  imageBytes: 1_500_000, imagesPerRoom: 20, uploadsPerMin: 10,
  roomTtlMs: 86_400_000,
} as const;
export function normalizeRoomName(raw: string): string | null;
export function randomRoomName(): string;            // 6 chars of [a-z0-9]
export class TokenBucket {
  constructor(ratePerSec: number, burst: number, now?: () => number);
  take(): boolean;
}
```

- [ ] Write `shared/limits.test.ts`:
  - `normalizeRoomName("My-Room")` → `"my-room"`
  - `normalizeRoomName("Hello World!")` → `"hello-world"` (runs of invalid chars become one `-`,
    and leading or trailing `-` is trimmed)
  - `normalizeRoomName("x".repeat(200))` → 40 `x`s
  - `normalizeRoomName("")`, `normalizeRoomName("!!!")` → `null`
  - `randomRoomName()` matches `/^[a-z0-9]{6}$/`
  - TokenBucket with a fake clock, `(30, 60)`: 60 `take()`s are `true`, the 61st is `false`;
    advance 1000 ms and 30 more are `true`, then `false`
- [ ] `npx vitest run shared` fails (nothing exists yet).
- [ ] Implement until the tests pass.
- [ ] Commit.

### Task 2: room routing and a static editor

**Consumes:** `normalizeRoomName`, `randomRoomName`, `LIMITS.docChars`.

- [ ] In `App.tsx`, read `location.pathname`. If it's `/`, use `history.replaceState` to go to
      `/${randomRoomName()}`. If the path normalizes to a different name (or `/a/b` → `a-b`),
      `replaceState` to the clean one. If it's `null`, go to `/`. No router library.
- [ ] `Editor.tsx`: CodeMirror with line numbers, a language dropdown (JavaScript, Python, HTML,
      CSS, Java, plain text), and a `EditorState.changeFilter` that rejects changes taking the doc
      past `LIMITS.docChars`.
- [ ] Header: room name, a "Copy link" button (`navigator.clipboard.writeText(location.href)`),
      and a "New room" link.
- [ ] Apply `minimalist-ui` for the base look. Keep it plain; the polish pass comes later.
- [ ] Check by hand: `/My Room!` → `/my-room`, and `/favicon.ico` still serves the icon (static
      assets win before the SPA fallback).

✅ Done when you can open `/anything`, type with highlighting, and copy the link. Nothing syncs yet.

---

## Milestone 2: naive sync, last-write-wins (3–5h)

📚 Learn first: [WebSocket API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket),
[Durable Objects WebSockets + hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[`partyserver` README](https://github.com/cloudflare/partykit/tree/main/packages/partyserver).

The point of this milestone is to build something that **looks** like it works and then prove
it doesn't.

### Task 3: Room server (LWW)

**Produces:** `export class Room extends Server` (from `partyserver`), with `static options = { hibernate: true }`.
Wire protocol, as JSON strings:
`{ "type": "set", "text": string }` from client to server; the server broadcasts the same shape to everyone else.
On connect, the server sends the latest `set`.

- [ ] `worker/index.ts`: `routePartykitRequest(request, env)`, otherwise `404`.
- [ ] `Room.onStart`: `CREATE TABLE IF NOT EXISTS doc (id INTEGER PRIMARY KEY CHECK (id = 1), text TEXT)`
      via `this.ctx.storage.sql.exec`.
- [ ] `onConnect`: send the stored text. `onMessage`: store it, then `this.broadcast(msg, [connection.id])`.

### Task 4: LWW client and the failing test

**Consumes:** the wire protocol above.

- [ ] `src/lww.ts`: write `connectLww(room, onRemoteText): { sendText(text: string): void, close(): void }`
      yourself with a raw `WebSocket` to `/parties/room/${room}`. No library: you want to see
      reconnects being your problem.
- [ ] Wire it into `Editor.tsx`. Remote text replaces the whole editor content.
- [ ] 🤝 Set up Playwright using the `e2e-playwright` skill (`webServer` = `npm run dev`).
- [ ] Write `e2e/sync.spec.ts`, test **"concurrent typing converges"**: two browser contexts open
      the same random room. Page A types `"aaaa"` and page B types `"bbbb"` at the same time
      (`Promise.all`, `pressSequentially` with `delay: 50`). Wait 1s.
      Assert both editors' text is equal **and** contains four `a`s and four `b`s.
- [ ] Run it. **It should fail.** Write down what you saw in `docs/notes/lww.md`: lost
      characters, cursor jumping, whose edit won and why.

✅ Done when two tabs sync roughly, the test fails reliably, and `lww.md` explains why. That
explanation is your interview answer for "why CRDTs?"

---

## Milestone 3: Yjs (4–6h, the hard one)

📚 Learn first: [Yjs docs: Y.Doc, shared types, updates](https://docs.yjs.dev/),
[`y-partyserver` README](https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver),
[`y-codemirror.next`](https://github.com/yjs/y-codemirror.next). Optional: the "CRDTs: the hard
parts" talk by Martin Kleppmann.

### Task 5: Yjs Room with persistence

**Produces:** `export class Room extends YServer` (replaces the LWW class; same binding and
migration). Document shape: `Y.Text("code")`, `Y.Array("images")`, `Y.Map("meta")` with a `language` key.

- [ ] `static options = { hibernate: true }`,
      `static callbackOptions = { debounceWait: 5000, debounceMaxWait: 15000 }`.
- [ ] `onLoad`: read the `state BLOB` row from a `snapshot` table and `Y.applyUpdate(this.document, state)`.
- [ ] `onSave`: `Y.encodeStateAsUpdate(this.document)`. If it's longer than `LIMITS.docBytesHard`,
      don't store it; `sendCustomMessage` `"too-large"` to every connection and close them.
      Otherwise upsert the snapshot.
- [ ] Delete `src/lww.ts` and Task 3's JSON protocol.

### Task 6: Yjs client

- [ ] Create the `Y.Doc` and a `YProvider` (`y-partyserver/provider`) with `party: "room"` and
      the room name. Bind CodeMirror with `yCollab(ytext, provider.awareness)`.
- [ ] The language dropdown reads and writes `Y.Map("meta").language`, so everyone switches together.
- [ ] Show a small status: connecting, live, or offline (from provider events).
- [ ] The M2 test **"concurrent typing converges"** now passes, without editing the test.
- [ ] Add a test, **"offline edits merge on reconnect"**: A and B are in a room. `A.context.setOffline(true)`,
      A types `"x1"`, B types `"y1"`, then `setOffline(false)`. Within 3s both contain `x1` and `y1`.
- [ ] Add a test, **"content survives everyone leaving"**: A types `"keep me"`, wait 6s (longer
      than the debounce), close all contexts, then open a fresh context on the same room and expect `"keep me"`.

✅ Done when all three sync tests pass and you can explain *why* Yjs converges where LWW
didn't (append it to `docs/notes/lww.md`).

---

## Milestone 4: presence and cursors (2–3h)

📚 Learn first: [Yjs awareness](https://docs.yjs.dev/getting-started/adding-awareness).

**Produces:** `src/presence.ts`: `getLocalUser(): { name: string; color: string }`. It's random
the first time (animal names, a fixed list of 8 colors that read clearly on a light background),
saved in `localStorage`, and wrapped in try/catch.

- [ ] `provider.awareness.setLocalStateField("user", getLocalUser())`. `yCollab` then draws
      remote cursors and selections.
- [ ] Header shows who's here (one dot plus name per awareness state). Clicking your own name renames you.
- [ ] e2e test **"sees the other user"**: B's header lists A's name within 2s of A joining.

✅ Done when two windows show each other's named cursors.

---

## Milestone 5: image paste (3–5h)

📚 Learn first: [Clipboard `paste` event and `clipboardData.files`](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event),
[`canvas.toBlob`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob),
[magic numbers (file signatures)](https://en.wikipedia.org/wiki/List_of_file_signatures).

### Task 7: server side

**Produces:**
```ts
// worker/images.ts
export function sniffImageType(bytes: Uint8Array):
  "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null;
```
HTTP: `POST /api/rooms/:room/images` (body = bytes) → `201 { id }`, or `413` / `415` / `429` with
`{ error }`. `GET /api/rooms/:room/images/:id` returns the bytes.

- [ ] `worker/images.test.ts`: the PNG, JPEG, GIF and WebP signatures return their type;
      `"<svg ...>"` bytes, empty input, and random bytes return `null`.
- [ ] Implement `sniffImageType` until the tests pass.
- [ ] `worker/index.ts`: match `/api/rooms/:room/images(/:id)?`, normalize the room, and forward
      to `(await getServerByName(env.Room, room)).fetch(request)`.
- [ ] `Room.onRequest`: an `images (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB, created_at INTEGER)`
      table. On POST, enforce `imageBytes`, `imagesPerRoom`, and `uploadsPerMin` (a `TokenBucket`
      per room), and sniff the type. On GET, return the bytes with the sniffed `Content-Type`,
      `X-Content-Type-Options: nosniff`, and `Cache-Control: public, max-age=86400, immutable`.

### Task 8: client side

**Produces:** `src/images.ts`: `compressImage(file: File, maxBytes: number): Promise<Blob>`
(WebP via canvas, stepping quality and then size down until it fits) and
`uploadImage(room: string, blob: Blob): Promise<string>` (resolves to the id).

- [ ] Handle `paste` and `drop` on the page. If `clipboardData.files` holds an image, call
      `preventDefault`, then compress, upload, and push `{ id, name, w, h, size, addedAt }` to
      `Y.Array("images")`. If it holds no image file, do nothing so the normal text paste happens.
- [ ] `ImageStrip.tsx`: thumbnails beside the editor; click to view full size.
      Errors show as a short inline message, not an alert.
- [ ] e2e test **"pasted image appears for others"**: dispatch a synthetic paste with a small
      PNG on A, and B's strip shows one image.
- [ ] e2e test **"svg and oversized are refused"**: POST an SVG straight to the API and expect
      `415`; POST 2 MB of PNG-signed bytes and expect `413`.

✅ Done when a screenshot pasted on the Air shows up on the mini in under 2 seconds.

---

## Milestone 6: expiry and limits (3–4h)

📚 Learn first: [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/),
token bucket rate limiting (any short article).

- [ ] In `onSave`, call `this.ctx.storage.setAlarm(Date.now() + LIMITS.roomTtlMs)`. That's one
      row write per save rather than per keystroke.
- [ ] `onAlarm`: `this.ctx.storage.deleteAll()`, then close any connections.
- [ ] Override `onConnect`: if there are already `LIMITS.connsPerRoom` connections, close the
      new one with code `1013`. Otherwise call `super.onConnect(...)`.
- [ ] Override `onMessage`: drop and close (`1009`) any message over `LIMITS.msgBytes`. Keep a
      per-connection `TokenBucket(msgsPerSec, msgBurst)` in a `Map` keyed by connection id
      (a reset after hibernation is fine), and close with `1008` when it runs dry. Otherwise
      call `super.onMessage(...)`.
- [ ] To test expiry by hand without waiting 24h, temporarily set `roomTtlMs` to 30s in dev
      and confirm the room comes back empty.
- [ ] Client: map the close codes and the `"too-large"` message to readable text in the status area.

✅ Done when the expiry check works, and a script sending 200 messages a second gets cut off
while normal typing never does.

---

## Milestone 7: harden and ship (3–5h)

- [ ] `/security-review` on the whole repo. Fix everything it rates high.
- [ ] `/ponytail-audit`: delete what isn't needed.
- [ ] `engineering:deploy-checklist`.
- [ ] `npx wrangler deploy`. Run the full Playwright suite against the deployed URL
      (`BASE_URL=https://codeshare.<you>.workers.dev npx playwright test`).
- [ ] Check Cloudflare dashboard → Workers → codeshare → Metrics after a real class.
      Usage should be a few percent of the free limits.
- [ ] Update `README.md`: what it is, the live link, how to run it, and the LWW-vs-CRDT story in 3 lines.
- [ ] Optional: `engineering:architecture` to turn the design's decision log into ADRs.

✅ Done when you use it in a Preface class.

---

## Later (not planned in detail yet)

- **View-only link.** Secret token in the URL fragment; the server marks those connections
  read-only (`y-partyserver` supports a read-only mode).
- **UI/UX pass.** `design:accessibility-review`, then visual polish.
- **Explain this code.** Workers AI behind `POST /api/rooms/:room/explain`, rate-limited per room
  with `TokenBucket`. About one evening.
