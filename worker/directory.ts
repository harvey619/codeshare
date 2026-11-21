import { DurableObject } from "cloudflare:workers";
import { isLive, type ShortLink } from "../shared/links";

const toLink = (r: Record<string, SqlStorageValue>): ShortLink => ({
  slug: r.slug as string,
  url: r.url as string,
  note: r.note as string,
  expires: r.expires as number | null,
  created: r.created as number,
  clicks: r.clicks as number,
  lastClick: r.last_click as number | null,
});

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
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS links (
      slug TEXT PRIMARY KEY, url TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', expires INTEGER,
      created INTEGER NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, last_click INTEGER)`);
  }

  // ---- Short links (/go/<slug>) ----

  listLinks(): ShortLink[] {
    return this.ctx.storage.sql.exec("SELECT * FROM links ORDER BY created DESC").toArray().map(toLink);
  }

  /** The link to follow, counting the visit; null if there's none or it has expired. */
  openLink(slug: string): string | null {
    const row = this.ctx.storage.sql.exec("SELECT * FROM links WHERE slug = ?", slug).toArray()[0];
    if (!row || !isLive(toLink(row))) return null;
    this.ctx.storage.sql.exec("UPDATE links SET clicks = clicks + 1, last_click = ? WHERE slug = ?", Date.now(), slug);
    return row.url as string;
  }

  /** Add a link, or edit one (`from` is its old name when renaming). Returns an error message on a clash. */
  saveLink(link: { slug: string; url: string; note: string; expires: number | null }, from: string | null): string | null {
    const sql = this.ctx.storage.sql;
    const taken = sql.exec("SELECT 1 FROM links WHERE slug = ?", link.slug).toArray().length > 0;
    if (from === null) {
      if (taken) return `/go/${link.slug} already exists`;
      sql.exec("INSERT INTO links (slug, url, note, expires, created) VALUES (?, ?, ?, ?, ?)", link.slug, link.url, link.note, link.expires, Date.now());
      return null;
    }
    if (from !== link.slug && taken) return `/go/${link.slug} already exists`;
    const changed = sql.exec("UPDATE links SET slug = ?, url = ?, note = ?, expires = ? WHERE slug = ?", link.slug, link.url, link.note, link.expires, from).rowsWritten;
    return changed ? null : `/go/${from} doesn't exist any more`;
  }

  deleteLink(slug: string) {
    this.ctx.storage.sql.exec("DELETE FROM links WHERE slug = ?", slug);
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
