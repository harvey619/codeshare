// Pure logic for the JSON tool, kept separate so it can be unit-tested.

export type JsonCheck =
  | { ok: true; value: unknown }
  | { ok: false; message: string; line: number | null; column: number | null };

/** Where in the text a character offset falls, 1-based. */
export function lineColumn(text: string, position: number) {
  const before = text.slice(0, position).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

export function checkJson(text: string): JsonCheck {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Browsers word this differently: "(line 3 column 5)" or "at position 42".
    const lc = raw.match(/line (\d+) column (\d+)/);
    const pos = raw.match(/position (\d+)/);
    const where = lc
      ? { line: Number(lc[1]), column: Number(lc[2]) }
      : pos
        ? lineColumn(text, Number(pos[1]))
        : { line: null, column: null };
    // Drop the location bits from the message since we show them separately.
    const message = raw.replace(/\s*(in JSON )?at position \d+.*$/, "").replace(/\s*\(line \d+ column \d+\)/, "");
    return { ok: false, message: message || "Invalid JSON", ...where };
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function formatJson(value: unknown, indent: number | "\t" | 0, sortKeys = false): string {
  const v = sortKeys ? sortDeep(value) : value;
  return indent === 0 ? JSON.stringify(v) : JSON.stringify(v, null, indent);
}
