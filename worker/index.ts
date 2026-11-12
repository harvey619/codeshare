import { getServerByName, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { LIMITS, TokenBucket, normalizeRoomName } from "../shared/limits";
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
    const id = new URL(request.url).pathname.split("/images/")[1];

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
      if (declared > LIMITS.imageBytes) return json({ error: "Image too large" }, 413);
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
}

const IMAGE_ROUTE = /^\/api\/rooms\/([^/]+)\/images(?:\/[0-9a-f-]+)?$/;
const ROOM_SOCKET = /^\/parties\/room\/[a-z0-9-]{1,40}$/;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;

    if (path.startsWith("/parties/") && !ROOM_SOCKET.test(path)) {
      return json({ error: "bad room" }, 400);
    }

    const match = path.match(IMAGE_ROUTE);
    if (match) {
      const room = normalizeRoomName(decodeURIComponent(match[1]));
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