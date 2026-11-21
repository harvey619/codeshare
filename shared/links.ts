// Short links: harveycodes.com/go/<name> sends people to a long URL. Only the admin makes them.

export type ShortLink = {
  slug: string;
  url: string;
  note: string;
  expires: number | null; // ms timestamp; after it the link stops working
  created: number;
  clicks: number;
  lastClick: number | null;
};

export const LINK_LIMITS = { slugLen: 40, urlLen: 2000, noteLen: 200 } as const;

/** "Claude Drive!" → "claude-drive". Null if nothing usable is left. */
export function normalizeSlug(raw: string): string | null {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, LINK_LIMITS.slugLen)
    .replace(/^-+|-+$/g, "");
  return slug === "" ? null : slug;
}

/** The long link, cleaned up, or an error message for the admin. */
export function checkTarget(raw: string, ownHost?: string): { url: string } | { error: string } {
  let text = raw.trim();
  if (!text) return { error: "Add the long link" };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`; // "docs.google.com/..." is fine
  if (text.length > LINK_LIMITS.urlLen) return { error: "That link is too long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "That doesn't look like a link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Links must start with https://" };
  if (ownHost && url.host === ownHost && /^\/go(\/|$)/.test(url.pathname)) return { error: "A short link can't point to another short link" };
  return { url: url.href };
}

export const isLive = (l: Pick<ShortLink, "expires">, now = Date.now()) => l.expires === null || l.expires > now;
