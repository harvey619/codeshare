// View-only links: the token is the room name encrypted with a server secret (AES-GCM),
// so a viewer can't work out the room name and switch to the editable link.
// Deterministic (the IV is derived from the room name), so a room always has the same link.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(text: string) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// Separate sub-keys for encryption and IV derivation, both from the one secret.
async function keys(secret: string) {
  const master = fromB64url(secret.replace(/=+$/, ""));
  const aesRaw = await hmac(master, enc.encode("codeshare-view-aes"));
  const ivRaw = await hmac(master, enc.encode("codeshare-view-iv"));
  const aes = await crypto.subtle.importKey("raw", aesRaw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return { aes, ivRaw };
}

const TAG_BITS = 96;

export async function makeViewToken(secret: string, room: string): Promise<string> {
  const { aes, ivRaw } = await keys(secret);
  const iv = (await hmac(ivRaw, enc.encode(room))).slice(0, 12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: TAG_BITS }, aes, enc.encode(room)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

/** The room name, or null if the token is malformed or was not made with this secret. */
export async function readViewToken(secret: string, token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(token)) return null;
  try {
    const raw = fromB64url(token);
    const { aes } = await keys(secret);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12), tagLength: TAG_BITS },
      aes,
      raw.slice(12),
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}
