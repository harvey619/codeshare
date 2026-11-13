export const LIMITS = {
  docChars: 200_000, docBytesHard: 1_000_000, msgBytes: 262_144,
  msgsPerSec: 30, msgBurst: 60, connsPerRoom: 50,
  imageBytes: 1_500_000, imagesPerRoom: 20, uploadsPerMin: 10,
  roomTtlMs: 14 * 24 * 60 * 60 * 1000,
  fileBytes: 10_000_000, roomFileBytes: 25_000_000, fileChunkBytes: 1_500_000,
} as const;

const MAX_ROOM_LEN = 40;

export function normalizeRoomName(raw: string): string | null {
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_ROOM_LEN)
    .replace(/^-+|-+$/g, "");
  if (name === "" || isReservedRoom(name)) return null;
  return name;
}

// "/tools/..." is the tools area, never a room. "/tools/qr" would normalise to "tools-qr".
export function isReservedRoom(name: string): boolean {
  return name === "tools" || name.startsWith("tools-");
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomRoomName(): string {
  let name = "";
  for (let i = 0; i < 6; i++) {
    name += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return name;
}

export class TokenBucket {
  private ratePerSec: number;
  private burst: number;
  private now: () => number;
  private tokens: number;
  private last: number;

  constructor(ratePerSec: number, burst: number, now: () => number = Date.now) {
    this.ratePerSec = ratePerSec;
    this.burst = burst;
    this.now = now;
    this.tokens = burst;
    this.last = now();
  }

  take(): boolean {
    const t = this.now();
    const elapsedSec = (t - this.last) / 1000;
    this.last = t;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.ratePerSec);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}