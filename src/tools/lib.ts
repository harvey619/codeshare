// Pure helpers for the tools, kept free of the DOM so they can be unit-tested.

// ---- colour ----
export type RGB = { r: number; g: number; b: number };

export function parseHex(text: string): RGB | null {
  let h = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
}

export const toHex = ({ r, g, b }: RGB) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export function toHsl({ r, g, b }: RGB) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function fromHsl(h: number, s: number, l: number): RGB {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = L - c / 2;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/** WCAG relative luminance and contrast ratio (1 to 21). */
export function luminance({ r, g, b }: RGB) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Nine tints and shades of a colour, light to dark. */
export function shades(rgb: RGB): string[] {
  const { h, s } = toHsl(rgb);
  return [95, 85, 75, 65, 55, 45, 35, 25, 15].map((l) => toHex(fromHsl(h, s, l)));
}

// ---- encode / decode ----
export function base64Encode(text: string) {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function base64Decode(b64: string) {
  const clean = b64.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean + "=".repeat((4 - (clean.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const htmlEncode = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
export const htmlDecode = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n]!);

/** Decodes (does not verify) a JSON Web Token. */
export function decodeJwt(token: string) {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("A JWT has three parts separated by dots");
  const part = (s: string) => JSON.parse(base64Decode(s));
  return { header: part(parts[0]), payload: part(parts[1]) as Record<string, unknown> };
}

// ---- generators ----
/** A password with characters picked evenly (no modulo bias) from the alphabet. */
export function randomString(length: number, alphabet: string) {
  const limit = Math.floor(0x100000000 / alphabet.length) * alphabet.length;
  let out = "";
  const buf = new Uint32Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) out += alphabet[buf[0] % alphabet.length];
  }
  return out;
}

// ---- pdf ----
/** "1-3, 5, 8-" with 10 pages -> [0,1,2,4,7,8,9] (zero-based, in the order written). */
export function parsePageRanges(text: string, pageCount: number): number[] {
  const pages: number[] = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*(-)?\s*(\d*)$/);
    if (!m || (!m[1] && !m[3])) throw new Error(`"${part}" isn't a page or range`);
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : pageCount) : from;
    if (from < 1 || to > pageCount || from > to) throw new Error(`"${part}" is outside pages 1-${pageCount}`);
    for (let p = from; p <= to; p++) pages.push(p - 1);
  }
  if (pages.length === 0) throw new Error("Type some pages, for example 1-3, 5");
  return pages;
}

// ---- time ----
/** Accepts seconds or milliseconds (13+ digits are treated as milliseconds). */
export function parseTimestamp(text: string): Date | null {
  const t = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  const date = new Date(Math.abs(n) >= 1e12 ? n : n * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
