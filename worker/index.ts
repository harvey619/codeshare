import { getServerByName, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { LIMITS, TokenBucket, isReservedRoom, normalizeRoomName } from "../shared/limits";
import { sniffImageType } from "./images";

const json = (body: unknown, status: number) => Response.json(body, { status });

export class Room extends YServer<Env> {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 5000, debounceMaxWait: 15000 };

  uploads = new TokenBucket(LIMITS.uploadsPerMin / 60, LIMITS.uploadsPerMin);
  buckets = new Map<string, TokenBucket>();

  onConnect(conn: Connection, ctx: ConnectionContext) {
    if ([...this.getConnections()].length > LIMITS.connsPerRoom) {
      conn.close(1013, "room-full");
      return;
    }
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

  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    this.buckets.delete(conn.id);
    return super.onClose(conn, code, reason, wasClean);
  }

  async onAlarm() {
    for (const conn of this.getConnections()) conn.close(4000, "expired");
    await this.ctx.storage.deleteAll();
    this.createTables();

    const doc = this.document;
    doc.transact(() => {
      const text = doc.getText("code");
      text.delete(0, text.length);
      const images = doc.getArray("images");
      images.delete(0, images.length);
      const files = doc.getArray("files");
      files.delete(0, files.length);
      const meta = doc.getMap("meta");
      for (const key of [...meta.keys()]) meta.delete(key);
    });
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
  }
  async onRequest(request: Request) {
    const [, kind, id] = new URL(request.url).pathname.match(/\/(images|files)(?:\/([0-9a-f-]+))?$/) ?? [];
    if (kind === "images") return this.handleImage(request, id);
    if (kind === "files") return this.handleFile(request, id);
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
      return json({ id: newId }, 201);
    }

    return json({ error: "method not allowed" }, 405);
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
      return json({ id: newId, name, size: bytes.byteLength }, 201);
    }

    return json({ error: "method not allowed" }, 405);
  }
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

const UPLOAD_ROUTE = /^\/api\/rooms\/([^/]+)\/(?:images|files)(?:\/[0-9a-f-]+)?$/;
const ROOM_SOCKET = /^\/parties\/room\/[a-z0-9-]{1,40}$/;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;

    if (path.startsWith("/parties/") && (!ROOM_SOCKET.test(path) || isReservedRoom(path.split("/")[3]))) {
      return json({ error: "bad room" }, 400);
    }

    const match = path.match(UPLOAD_ROUTE);
    if (match) {
      let room: string | null = null;
      try {
        room = normalizeRoomName(decodeURIComponent(match[1]));
      } catch {
        // malformed percent-encoding
      }
      if (!room) return json({ error: "bad room" }, 400);
      const stub = await getServerByName(env.Room, room);
      return stub.fetch(request);
    }
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;