// Pure logic for the class picker and timer, kept separate so it can be unit-tested.

/** One name per line; trims, drops blanks and duplicates (case-insensitive), keeps order. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const name = line.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * Picks a random name nobody has had yet this round. When everyone has been picked,
 * a new round starts (but never the same person twice in a row, if there's a choice).
 */
export function pickNext(names: string[], picked: string[], random = Math.random) {
  if (names.length === 0) return null;
  let done = picked.filter((n) => names.includes(n));
  let pool = names.filter((n) => !done.includes(n));
  if (pool.length === 0) {
    const last = done[done.length - 1];
    done = [];
    pool = names.length > 1 ? names.filter((n) => n !== last) : names;
  }
  const name = pool[Math.floor(random() * pool.length)];
  return { name, picked: [...done, name], left: names.length - done.length - 1 };
}

/** 754_000 ms -> "12:34". Rounds up so the display hits 0:00 exactly at the end. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
