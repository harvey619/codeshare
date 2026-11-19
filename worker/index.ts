import { getServerByName, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { LIMITS, TokenBucket, isReservedRoom, normalizeRoomName } from "../shared/limits";
import { sniffImageType } from "./images";
import { readViewToken, makeViewToken } from "./viewToken";
import { Directory } from "./directory";

export { Directory };
import { MAIN_ID, dedupeTabs, textKey, type FileTab } from "../shared/files";

const EXPLAIN_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const EXPLAIN_PROMPT = `You are a patient programming teacher helping beginners in a small coding class.
Explain what the code does in plain English: first one or two sentences on its overall purpose,
then a short step-by-step walkthrough. If you spot a bug or a likely mistake, mention it briefly at the end.
Use short paragraphs, bullet points and \`inline code\`. Keep it under 250 words. Do not rewrite the whole program.`;

const json = (body: unknown, status: number) => Response.json(body, { status });

export class Room extends YServer<Env> {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 5000, debounceMaxWait: 15000 };

  uploads = new TokenBucket(LIMITS.uploadsPerMin / 60, LIMITS.uploadsPerMin);
  explains = new TokenBucket(1 / 60, 5); // 5 at once, then one a minute per room
  checkpoints = new TokenBucket(6 / 60, 6);
  lastEdit: number | null = null;
  reportTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tell the admin directory how this room is doing (debounced: joins and leaves come in bursts). */
  reportSoon() {
    if (this.reportTimer) return;
    this.reportTimer = setTimeout(() => {
      this.reportTimer = null;
      this.report().catch((err) => console.error("directory report failed", err));
    }, 1000);
  }

  async report() {
    const sql = this.ctx.storage.sql;
    const count = (table: string) => sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).one().n as number;
    const directory = this.env.Directory.getByName("main");
    // Only open sockets: one that just closed can still be listed for a moment.
    const people = [...this.getConnections()].filter((c) => c.readyState === WebSocket.OPEN).length;
    // Nothing saved and nobody here (for example just after Delete): keep it off the list.
    if (people === 0 && count("snapshot") === 0 && count("files") === 0 && count("images") === 0) {
      await directory.remove(this.name);
      return;
    }
    await directory.report(this.name, {
      size: sql.databaseSize,
      people,
      images: count("images"),
      files: count("files"),
      lastEdit: this.lastEdit,
      expires: await this.ctx.storage.getAlarm(),
    });
  }


  buckets = new Map<string, TokenBucket>();

  onConnect(conn: Connection, ctx: ConnectionContext) {
    if ([...this.getConnections()].length > LIMITS.connsPerRoom) {
      conn.close(1013, "room-full");
      return;
    }
    // Set by the Worker for /view/ links only. Survives hibernation (connection state).
    if (ctx.request.headers.get("x-codeshare-view") === "1") conn.setState({ readOnly: true });
    this.reportSoon();
    return super.onConnect(conn, ctx);
  }

  onMessage(conn: Connection, message: WSMessage) {
    const size = typeof message === "string" ? message.length : message.byteLength;
    if (size > LIMITS.msgBytes) {
      conn.close(1009, "message-too-large");
      return;
    }
    let bucket = this.buckets.get(conn.id);
    if (!bucket) {
      bucket = new TokenBucket(LIMITS.msgsPerSec, LIMITS.msgBurst);
      this.buckets.set(conn.id, bucket);
    }
    if (!bucket.take()) {
      conn.close(1008, "rate-limited");
      return;
    }
    return super.onMessage(conn, message);
  }

  isReadOnly(conn: Connection) {
    return (conn.state as { readOnly?: boolean } | null)?.readOnly === true;
  }

  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    this.buckets.delete(conn.id);
    // A close can arrive after a report was already counted: always report again afterwards.
    if (this.reportTimer) clearTimeout(this.reportTimer);
    this.reportTimer = null;
    this.reportSoon();
    return super.onClose(conn, code, reason, wasClean);
  }

  /** Erase everything (expiry or the admin's Delete) and disconnect everyone with `code`. */
  async wipe(code: number, reason: string) {
    const name = this.name;
    for (const conn of this.getConnections()) conn.close(code, reason);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.createTables();
    this.lastEdit = null;

    // Empty the in-memory doc too, or the old content would sync straight back.
    const doc = this.document;
    doc.transact(() => {
      for (const key of [...doc.share.keys()]) {
        if (key === "code" || key.startsWith("file:")) {
          const text = doc.getText(key);
          text.delete(0, text.length);
        }
      }
      for (const key of ["images", "files", "tabs"]) {
        const arr = doc.getArray(key);
        arr.delete(0, arr.length);
      }
      const meta = doc.getMap("meta");
      for (const key of [...meta.keys()]) meta.delete(key);
    });
    await this.env.Directory.getByName("main").remove(name);
  }

  async onAlarm() {
    await this.wipe(4000, "expired");
  }

  createTables() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), state BLOB)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB, created_at INTEGER)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT, size INTEGER, created_at INTEGER)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS file_chunks (file_id TEXT, idx INTEGER, bytes BLOB, PRIMARY KEY (file_id, idx))",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER, hash TEXT, summary TEXT, state BLOB)",
    );
  }

  async onLoad() {
    this.createTables();
    const row = this.ctx.storage.sql.exec("SELECT state FROM snapshot WHERE id = 1").toArray()[0];
    if (row) {
      Y.applyUpdate(this.document, new Uint8Array(row.state as ArrayBuffer));
    }
  }

  async onSave() {
    const state = Y.encodeStateAsUpdate(this.document);
    if (state.byteLength > LIMITS.docBytesHard) {
      for (const conn of this.getConnections()) {
        this.sendCustomMessage(conn, "too-large");
        conn.close(1009, "too-large");
      }
      return;
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO snapshot (id, state) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state",
      state,
    );
    await this.ctx.storage.setAlarm(Date.now() + LIMITS.roomTtlMs);
    await this.checkpoint(state, false);
    this.lastEdit = Date.now();
    this.reportSoon();
  }

  /** Files and their sizes, for the history list. */
  summary() {
    const doc = this.document;
    let tabs = dedupeTabs(doc.getArray<FileTab>("tabs").toArray());
    if (tabs.length === 0) tabs = [{ id: MAIN_ID, name: "main" }];
    return tabs.map((t) => ({ name: t.name, chars: doc.getText(textKey(t.id)).length }));
  }

  /**
   * Save a restorable copy of the room. Automatic ones are at most every 5 minutes;
   * `force` (used just before a restore) always saves. Identical states are skipped.
   */
  async checkpoint(state: Uint8Array, force: boolean) {
    const sql = this.ctx.storage.sql;
    const last = sql.exec("SELECT created_at, hash FROM history ORDER BY id DESC LIMIT 1").toArray()[0];
    if (!force && last && Date.now() - (last.created_at as number) < LIMITS.historyEveryMs) return null;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", state));
    const hash = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (last && last.hash === hash) return null;
    sql.exec(
      "INSERT INTO history (created_at, hash, summary, state) VALUES (?, ?, ?, ?)",
      Date.now(), hash, JSON.stringify(this.summary()), state,
    );
    sql.exec(
      "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?)",
      LIMITS.historyKeep,
    );
    return sql.exec("SELECT last_insert_rowid() AS id").one().id as number;
  }
  async onRequest(request: Request) {
    // Admin actions. Only the Worker can reach /internal/ paths (no public route forwards
    // to them), and it checks the admin token first; the header is a second check.
    const admin = new URL(request.url).pathname.match(/^\/internal\/admin\/(end|delete)$/);
    if (admin) {
      if (!this.env.ADMIN_TOKEN || request.headers.get("x-codeshare-admin") !== this.env.ADMIN_TOKEN) {
        return json({ error: "forbidden" }, 403);
      }
      if (admin[1] === "delete") await this.wipe(4002, "deleted");
      else {
        for (const conn of this.getConnections()) conn.close(4001, "ended");
        this.reportSoon();
      }
      return json({ ok: true }, 200);
    }

    const [, kind, id] = new URL(request.url).pathname.match(/\/(images|files|history|explain)(?:\/([0-9a-f-]+))?$/) ?? [];
    if (kind === "images") return this.handleImage(request, id);
    if (kind === "files") return this.handleFile(request, id);
    if (kind === "history") return this.handleHistory(request, id);
    if (kind === "explain" && !id) return this.handleExplain(request);
    return json({ error: "not found" }, 404);
  }

  async handleImage(request: Request, id: string | undefined) {
    if (request.method === "GET" && id) {
      const row = this.ctx.storage.sql
        .exec("SELECT mime, bytes FROM images WHERE id = ?", id)
        .toArray()[0];
      if (!row) return json({ error: "not found" }, 404);
      return new Response(row.bytes as ArrayBuffer, {
        headers: {
          "Content-Type": row.mime as string,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    if (request.method === "POST" && !id) {
      if (!this.uploads.take()) return json({ error: "Too many uploads, wait a minute" }, 429);

      const declared = Number(request.headers.get("Content-Length") ?? 0);
      if (declared > LIMITS.imageBytes) return tooLarge(request, "Image too large");
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > LIMITS.imageBytes) return json({ error: "Image too large" }, 413);

      const mime = sniffImageType(bytes);
      if (!mime) return json({ error: "Only PNG, JPEG, WebP or GIF" }, 415);

      const count = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM images").one().n as number;
      if (count >= LIMITS.imagesPerRoom) return json({ error: "This room is full of images" }, 413);

      const newId = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        "INSERT INTO images (id, mime, bytes, created_at) VALUES (?, ?, ?, ?)",
        newId, mime, bytes, Date.now(),
      );
      this.reportSoon();
      return json({ id: newId }, 201);
    }

    return json({ error: "method not allowed" }, 405);
  }

  async handleHistory(request: Request, id: string | undefined) {
    const sql = this.ctx.storage.sql;
    if (request.method === "GET" && !id) {
      const rows = sql.exec("SELECT id, created_at, summary FROM history ORDER BY id DESC").toArray();
      return json(rows.map((r) => ({ id: r.id, at: r.created_at, files: JSON.parse(r.summary as string) })), 200);
    }
    if (request.method === "GET" && id) {
      const row = sql.exec("SELECT state FROM history WHERE id = ?", Number(id)).toArray()[0];
      if (!row) return json({ error: "not found" }, 404);
      return new Response(row.state as ArrayBuffer, {
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=86400, immutable" },
      });
    }
    if (request.method === "POST" && !id) {
      // Save the current state now, so a restore can itself be undone.
      if (!this.checkpoints.take()) return json({ error: "Too many saves, wait a minute" }, 429);
      const saved = await this.checkpoint(Y.encodeStateAsUpdate(this.document), true);
      return json({ id: saved }, 201);
    }
    return json({ error: "method not allowed" }, 405);
  }

  async handleExplain(request: Request) {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    let body: { code?: unknown; language?: unknown; file?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Expected JSON" }, 400);
    }
    const code = typeof body.code === "string" ? body.code : "";
    if (!code.trim()) return json({ error: "There's no code to explain" }, 400);
    if (code.length > LIMITS.explainChars) return json({ error: "That's too much code, select a smaller part" }, 413);
    if (!this.explains.take()) return json({ error: "Explain is busy for this room, try again in a minute" }, 429);
    const language = typeof body.language === "string" ? body.language.slice(0, 20) : "code";
    const file = typeof body.file === "string" ? body.file.slice(0, 40) : "";

    let upstream: ReadableStream<Uint8Array>;
    try {
      upstream = (await this.env.AI.run(EXPLAIN_MODEL as Parameters<Ai["run"]>[0], {
        messages: [
          { role: "system", content: EXPLAIN_PROMPT },
          { role: "user", content: `Explain this ${language}${file ? ` from ${file}` : ""}:\n\n\`\`\`\n${code}\n\`\`\`` },
        ],
        stream: true,
        max_tokens: 1200,
        // A plain explanation doesn't need the model's hidden "thinking": it's slower and
        // uses up the token budget before the answer is finished.
        chat_template_kwargs: { enable_thinking: false },
      } as never)) as unknown as ReadableStream<Uint8Array>;
    } catch (err) {
      console.error("explain failed", err);
      return json({ error: "The AI is unavailable right now (it may have hit today's free limit)" }, 503);
    }
    return new Response(upstream.pipeThrough(sseToText()), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  async handleFile(request: Request, id: string | undefined) {
    const sql = this.ctx.storage.sql;

    if (request.method === "GET" && id) {
      const file = sql.exec("SELECT name, size FROM files WHERE id = ?", id).toArray()[0];
      if (!file) return json({ error: "not found" }, 404);
      const out = new Uint8Array(file.size as number);
      let offset = 0;
      for (const chunk of sql.exec("SELECT bytes FROM file_chunks WHERE file_id = ? ORDER BY idx", id)) {
        const part = new Uint8Array(chunk.bytes as ArrayBuffer);
        out.set(part, offset);
        offset += part.byteLength;
      }
      return new Response(out, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name as string)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    if (request.method === "POST" && !id) {
      if (!this.uploads.take()) return json({ error: "Too many uploads, wait a minute" }, 429);

      const declared = Number(request.headers.get("Content-Length") ?? 0);
      if (declared > LIMITS.fileBytes) return tooLarge(request, "File too large (10 MB max)");
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > LIMITS.fileBytes) return json({ error: "File too large (10 MB max)" }, 413);
      if (bytes.byteLength === 0) return json({ error: "File is empty" }, 400);

      const used = sql.exec("SELECT COALESCE(SUM(size), 0) AS n FROM files").one().n as number;
      if (used + bytes.byteLength > LIMITS.roomFileBytes) {
        return json({ error: "This room is out of file space (25 MB)" }, 413);
      }

      const name = sanitizeFileName(request.headers.get("X-File-Name"));
      const newId = crypto.randomUUID();
      this.ctx.storage.transactionSync(() => {
        sql.exec(
          "INSERT INTO files (id, name, size, created_at) VALUES (?, ?, ?, ?)",
          newId, name, bytes.byteLength, Date.now(),
        );
        for (let i = 0, idx = 0; i < bytes.byteLength; i += LIMITS.fileChunkBytes, idx++) {
          sql.exec(
            "INSERT INTO file_chunks (file_id, idx, bytes) VALUES (?, ?, ?)",
            newId, idx, bytes.subarray(i, i + LIMITS.fileChunkBytes),
          );
        }
      });
      this.reportSoon();
      return json({ id: newId, name, size: bytes.byteLength }, 201);
    }

    return json({ error: "method not allowed" }, 405);
  }
}

// Workers AI streams Server-Sent Events. Pass on only the answer text (no reasoning, no framing).
function sseToText() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const handle = (line: string, out: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const msg = JSON.parse(data);
      const text: unknown = msg.response ?? msg.choices?.[0]?.delta?.content;
      if (typeof text === "string" && text) out.enqueue(encoder.encode(text));
    } catch {
      // partial or non-JSON line: skip
    }
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, out) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handle(line, out);
    },
    flush(out) {
      handle(buffer, out);
    },
  });
}

// Read and discard the body before replying. Answering mid-upload makes some
// clients (and the local dev proxy) see a dropped connection instead of the 413.
async function tooLarge(request: Request, error: string) {
  await request.body?.pipeTo(new WritableStream()).catch(() => {});
  return json({ error }, 413);
}

function sanitizeFileName(header: string | null): string {
  let raw = "";
  try {
    raw = decodeURIComponent(header ?? "");
  } catch {
    raw = header ?? "";
  }
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[/\\\x00-\x1f\x7f"']/g, "").trim().slice(0, 120);
  return name || "file";
}

const ROOM_API = /^\/api\/rooms\/([^/]+)\/(?:images|files|history|explain)(?:\/[0-9a-f-]+)?$/;
const VIEW_LINK = /^\/api\/rooms\/([^/]+)\/view-link$/;
const VIEW_SOCKET = /^\/parties\/view\/([A-Za-z0-9_-]+)$/;
const VIEW_API = /^\/api\/view\/([A-Za-z0-9_-]+)\/((?:images|files)\/[0-9a-f-]+)$/;

function roomFromPath(segment: string) {
  try {
    return normalizeRoomName(decodeURIComponent(segment));
  } catch {
    return null; // malformed percent-encoding
  }
}

async function sha256(text: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

/** Constant-time check of the admin token (hashing first makes the lengths equal). */
async function isAdmin(request: Request, env: Env) {
  const given = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.ADMIN_TOKEN || !given) return false;
  return crypto.subtle.timingSafeEqual(await sha256(given), await sha256(env.ADMIN_TOKEN));
}

// The admin page's API: list rooms with totals, end a session, or delete a room.
async function handleAdmin(request: Request, env: Env, path: string) {
  if (!env.ADMIN_TOKEN) return json({ error: "Admin isn't set up: add the ADMIN_TOKEN secret" }, 503);
  if (!(await isAdmin(request, env))) return json({ error: "Wrong admin token" }, 401);

  if (path === "/api/admin/rooms" && request.method === "GET") {
    const rooms = await env.Directory.getByName("main").list();
    const totals = {
      rooms: rooms.length,
      active: rooms.filter((r) => r.people > 0).length,
      people: rooms.reduce((n, r) => n + r.people, 0),
      bytes: rooms.reduce((n, r) => n + r.size, 0),
    };
    return json({ rooms, totals }, 200);
  }

  const action = path.match(/^\/api\/admin\/rooms\/([^/]+)\/(end|delete)$/);
  if (action && request.method === "POST") {
    const room = roomFromPath(action[1]);
    if (!room) return json({ error: "bad room" }, 400);
    const url = new URL(request.url);
    url.pathname = `/internal/admin/${action[2]}`;
    const headers = new Headers({ "x-codeshare-admin": env.ADMIN_TOKEN });
    const stub = await getServerByName(env.Room, room);
    return stub.fetch(new Request(url, { method: "POST", headers }));
  }
  return json({ error: "not found" }, 404);
}

/** Forward a request to a room's Durable Object under a rewritten path, optionally read-only. */
async function toRoom(env: Env, room: string, request: Request, path: string, viewOnly: boolean) {
  const url = new URL(request.url);
  url.pathname = path;
  const forwarded = new Request(url, request);
  forwarded.headers.delete("x-codeshare-view");
  if (viewOnly) forwarded.headers.set("x-codeshare-view", "1");
  const stub = await getServerByName(env.Room, room);
  return stub.fetch(forwarded);
}
const ROOM_SOCKET = /^\/parties\/room\/[a-z0-9-]{1,40}$/;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;

    if (path.startsWith("/api/admin/")) return handleAdmin(request, env, path);

    // View-only links: the token decrypts to the room; the browser never learns its name.
    const viewSocket = path.match(VIEW_SOCKET);
    const viewApi = path.match(VIEW_API);
    if (viewSocket || viewApi) {
      if (!env.VIEW_KEY) return json({ error: "view links are not set up" }, 503);
      const room = await readViewToken(env.VIEW_KEY, (viewSocket ?? viewApi)![1]);
      if (!room || !normalizeRoomName(room)) return json({ error: "bad link" }, 404);
      if (viewSocket) return toRoom(env, room, request, `/parties/room/${room}`, true);
      if (request.method !== "GET") return json({ error: "view only" }, 405);
      return toRoom(env, room, request, `/api/rooms/${room}/${viewApi![2]}`, true);
    }

    if (path.startsWith("/parties/") && (!ROOM_SOCKET.test(path) || isReservedRoom(path.split("/")[3]))) {
      return json({ error: "bad room" }, 400);
    }

    const viewLink = path.match(VIEW_LINK);
    if (viewLink) {
      const room = roomFromPath(viewLink[1]);
      if (!room) return json({ error: "bad room" }, 400);
      if (!env.VIEW_KEY) return json({ error: "view links are not set up" }, 503);
      return json({ token: await makeViewToken(env.VIEW_KEY, room) }, 200);
    }

    const match = path.match(ROOM_API);
    if (match) {
      const room = roomFromPath(match[1]);
      if (!room) return json({ error: "bad room" }, 400);
      return toRoom(env, room, request, path, false);
    }
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;