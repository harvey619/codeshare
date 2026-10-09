# codeshare — design

Share-a-link code pad with live multi-user editing. Type `codeshare.example/anything`
and you're in a room that anyone else at the same URL can edit with you.

## Goals

- Live editing for small groups (typically 5–6 people in a class), desktop/laptop first
- Zero accounts, zero passwords: the URL is the room
- Runs entirely on Cloudflare's **free plan**, with no payment card on file
- Teaches: realtime sync (last-write-wins vs CRDTs), WebSockets and presence,
  the Clipboard API, binary storage, abuse controls

## Non-goals (for now)

- Accounts, passwords, private rooms
- View-only links (later milestone)
- Mobile editing
- Visual polish beyond a clean minimalist baseline (UI/UX pass comes after it works)
- 3D, animation, video

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript | Tool behind a link: no SEO, no server rendering needed |
| Editor | CodeMirror 6 + `y-codemirror.next` | Lightweight, first-class Yjs binding, syntax highlighting via language packages |
| Sync | Yjs (CRDT) | Concurrent edits merge without conflicts; awareness protocol gives presence and cursors |
| Realtime server | Cloudflare Worker + one Durable Object per room (`y-partyserver`) | Each room is a single stateful object holding live WebSockets; free plan supports SQLite-backed DOs |
| Storage | The room's own Durable Object SQLite | Doc snapshot + images live with the room and die with it. No R2, no card |
| Hosting | Cloudflare Workers (static assets + Worker in one deploy) | Same free plan, one `wrangler deploy` |
| Look | `minimalist-ui` | Locked look, no design rounds |

## Architecture

```
Browser (Vite + React + CodeMirror 6)
  │
  ├─ GET /, /:room ─────────► Worker ── serves the SPA (static assets)
  │
  ├─ WebSocket /ws/:room ───► Worker ──► Room Durable Object (named by :room)
  │                                       • Yjs doc in memory
  │                                       • relays doc updates + awareness to every socket
  │                                       • hibernates when idle
  │                                       • snapshots doc to SQLite (debounced)
  │                                       • enforces limits per connection
  │                                       • alarm: 24h after last edit → deleteAll()
  │
  ├─ POST /api/rooms/:room/images ─► Worker ──► Room DO: validate, store blob row
  └─ GET  /api/rooms/:room/images/:id ─► Worker ──► Room DO: return blob (cache immutable)
```

### Routing

- `/` → client picks a random 6-character name and `history.replaceState`s to `/:name`
- `/:room` → open (or create) that room. No router library: read `location.pathname`
- Room names: `^[a-z0-9-]{1,40}$`, lowercased. Anything else → redirect to a cleaned name or `/`
- Worker routes `/ws/*` and `/api/*`; everything else falls through to the SPA
  (`not_found_handling = "single-page-application"`)

### Room lifecycle

1. First connection to `/ws/:room` → `idFromName(room)` creates the DO lazily
2. On load the DO reads its latest snapshot from SQLite (if any) into the Y.Doc
3. Edits are relayed live; the DO writes a snapshot at most every ~5 seconds while dirty
4. Every edit reschedules a single alarm for `now + 24h`
5. Alarm fires → `ctx.storage.deleteAll()` → the room, its doc and its images are gone.
   The next visitor to that URL gets a fresh empty room

## Sync design

### Milestone 2: last-write-wins (deliberately naive)

- Client sends the **whole document text** on every change: `{ type: "set", text, ts }`
- DO keeps the latest text and broadcasts it to all other sockets
- Receivers replace their editor contents
- Expected failure, and the point of the milestone: two people typing at once
  overwrite each other, and cursors jump. Document what you observe in `docs/notes/lww.md`

### Milestone 3+: Yjs

- One `Y.Doc` per room with:
  - `Y.Text("code")`: the editor contents
  - `Y.Array("images")`: `{ id, name, w, h, size, addedAt }` metadata only
  - `Y.Map("meta")`: `{ language }`, so everyone sees the same syntax mode
- Server: `y-partyserver` (`YServer`) with `onLoad` / `onSave` hooks wired to the DO's SQLite,
  hibernation on, save debounced
- Client: `y-partyserver/provider` + `y-codemirror.next` binding
- Presence: Yjs awareness. Each client sets `{ name, color }` (random animal name + color,
  editable, remembered in `localStorage`). Remote cursors and selections come from the binding

## Images

1. User pastes (or drops) an image into the page. The `paste` event reads `clipboardData.files`
2. Client checks type (`image/png|jpeg|webp|gif`) and size
3. Client re-encodes to WebP via `<canvas>` and downscales until it's ≤ 1.5 MB
   (DO SQLite rows max out at 2 MB)
4. `POST /api/rooms/:room/images` with the bytes
5. DO validates again (type sniffed from magic bytes, size, per-room count), stores
   `(id, mime, bytes, created_at)` in an `images` table, returns `id`
6. Client pushes metadata into `Y.Array("images")`, and everyone's image strip updates live
7. Images render in a strip beside the editor from `GET .../images/:id` with
   `Cache-Control: public, max-age=86400, immutable`. The code stays plain text

## Limits and abuse controls

All enforced **server-side** in the DO (the client checks are just for UX):

| Limit | Value | Where |
|---|---|---|
| Doc size | 200 KB encoded | Reject updates that would exceed it; tell the client |
| WebSocket message size | 256 KB | Close the socket with a policy code |
| Messages per connection | ~30/s sustained, burst 60 | In-memory token bucket per socket |
| Connections per room | 50 | Refuse beyond that |
| Image size | 1.5 MB after compression | Client + DO |
| Images per room | 20 | DO |
| Image uploads per room | 10 per minute | DO |
| Room lifetime | 24h after last edit | DO alarm |
| Room name | `[a-z0-9-]{1,40}` | Worker |

Content safety: images are served with their sniffed MIME type, `X-Content-Type-Options: nosniff`,
and never as HTML/SVG (SVG is rejected, since it can carry scripts). Names and usernames render
as text only, never as HTML.

## Free-tier budget (Cloudflare Workers Free)

| Resource | Free limit | Expected for a 2h class of 6 |
|---|---|---|
| Worker requests | 100k/day | Hundreds |
| DO requests (incoming WS messages count 1/20) | 100k/day | ~1–2k |
| DO duration | 13,000 GB-s/day | Small, hibernation keeps idle tabs free |
| DO rows written | 100k/day | ~1.5k (debounced snapshots + images) |
| DO storage | 5 GB total | MBs, rooms self-delete |

On the free plan, exceeding a limit returns errors until the limit resets. It never bills.

## Testing

- **Unit (Vitest):** room-name validation, token bucket, image size and type checks, doc-size guard
- **E2E (Playwright, via the `e2e-playwright` skill):**
  1. Two browser contexts open `/test-room`, both type at the same time, and the final text is identical
  2. Late joiner sees existing content
  3. Paste an image in one context and it appears in the other
  4. Oversized image is rejected with a visible message
- Local runs use `wrangler dev` (Miniflare), which emulates DOs and SQLite at no cost

## Stretch: explain this code

A button that sends the current selection to Cloudflare Workers AI (free daily allocation)
via a Worker route, rate-limited per room. Optional, built after everything else works.

## Later

- View-only link (secret token in the URL fragment, read-only enforced in the DO)
- UI/UX pass (`design:accessibility-review`, then visual polish)
- Download as file, language auto-detect, line-link sharing (`#L10-20`)

## Decisions

| Decision | Chosen | Over | Because |
|---|---|---|---|
| Realtime platform | Cloudflare DOs | Supabase Realtime | Owner already knows Supabase; DOs teach the WebSocket server side; free tier fits comfortably |
| Image storage | DO SQLite | R2, Supabase Storage | No card needed, deleted with the room, one fewer service |
| Room access | Open URL, anyone edits | Tokens or passwords | Simplicity, same as codeshare.io; view-only comes later |
| Editor | CodeMirror 6 | Monaco | ~10× lighter, maintained Yjs binding |
| Sync | LWW first, then Yjs | Straight to Yjs | See the failure before learning the fix |
