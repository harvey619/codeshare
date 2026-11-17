import { DurableObject } from "cloudflare:workers";

// One small Durable Object that every room reports to, so the admin page can list rooms.
// Rooms report when they're edited, when someone joins or leaves, and when they're wiped.

export type RoomReport = {
  size: number; // bytes in the room's own SQLite (doc, history, images, files)
  people: number;
  images: number;
  files: number;
  lastEdit: number | null;
  expires: number | null;
};
export type RoomRow = RoomReport & { name: string; updated: number };

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
      name TEXT PRIMARY KEY, size INTEGER, people INTEGER, images INTEGER, files INTEGER,
      last_edit INTEGER, expires INTEGER, updated INTEGER)`);
  }

  report(name: string, r: RoomReport) {
    this.ctx.storage.sql.exec(
      `INSERT INTO rooms (name, size, people, images, files, last_edit, expires, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET size = excluded.size, people = excluded.people, images = excluded.images,
         files = excluded.files, last_edit = COALESCE(excluded.last_edit, rooms.last_edit), expires = excluded.expires,
         updated = excluded.updated`,
      name, r.size, r.people, r.images, r.files, r.lastEdit, r.expires, Date.now(),
    );
  }

  remove(name: string) {
    this.ctx.storage.sql.exec("DELETE FROM rooms WHERE name = ?", name);
  }

  list(): RoomRow[] {
    return this.ctx.storage.sql
      .exec("SELECT * FROM rooms ORDER BY people DESC, COALESCE(last_edit, updated) DESC")
      .toArray()
      .map((r) => ({
        name: r.name as string,
        size: r.size as number,
        people: r.people as number,
        images: r.images as number,
        files: r.files as number,
        lastEdit: r.last_edit as number | null,
        expires: r.expires as number | null,
        updated: r.updated as number,
      }));
  }
}
