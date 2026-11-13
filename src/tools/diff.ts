// Turns two texts into numbered diff rows. Line matching is done by the `diff` package (BSD-3).
import { diffArrays, diffWordsWithSpace } from "diff";

export type Part = { text: string; changed: boolean };
export type Row =
  | { kind: "same"; oldNo: number; newNo: number; text: string }
  | { kind: "del"; oldNo: number; parts: Part[] }
  | { kind: "add"; newNo: number; parts: Part[] };

export type Options = { ignoreWhitespace: boolean; ignoreCase: boolean };

const splitLines = (value: string) => {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // trailing newline isn't an extra line
  return lines;
};

/** Highlights the words that changed between a removed line and the added line that replaced it. */
function wordParts(a: string, b: string): [Part[], Part[]] {
  const del: Part[] = [];
  const add: Part[] = [];
  for (const c of diffWordsWithSpace(a, b)) {
    if (!c.added) del.push({ text: c.value, changed: !!c.removed });
    if (!c.removed) add.push({ text: c.value, changed: !!c.added });
  }
  return [del, add];
}

export function diffRows(a: string, b: string, opts: Options = { ignoreWhitespace: false, ignoreCase: false }) {
  // Compare whole lines; with the ignore options, lines match after normalising.
  const norm = (line: string) => {
    let out = opts.ignoreWhitespace ? line.trim().replace(/\s+/g, " ") : line;
    if (opts.ignoreCase) out = out.toLowerCase();
    return out;
  };
  const changes = diffArrays(splitLines(a), splitLines(b), { comparator: (x, y) => norm(x) === norm(y) });
  const rows: Row[] = [];
  let oldNo = 1;
  let newNo = 1;
  let added = 0;
  let removed = 0;

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const lines = c.value;
    if (c.removed) {
      const next = changes[i + 1];
      const replacement = next?.added ? next.value : [];
      const dels: Row[] = [];
      const adds: Row[] = [];
      lines.forEach((line, j) => {
        // Pair the line with its replacement, if any, for word-level highlights.
        const [d, ad] = j < replacement.length ? wordParts(line, replacement[j]) : [[{ text: line, changed: true }], []];
        dels.push({ kind: "del", oldNo: oldNo++, parts: d });
        if (j < replacement.length) adds.push({ kind: "add", newNo: newNo++, parts: ad });
      });
      for (const line of replacement.slice(lines.length)) {
        adds.push({ kind: "add", newNo: newNo++, parts: [{ text: line, changed: true }] });
      }
      rows.push(...dels, ...adds);
      removed += lines.length;
      added += replacement.length;
      if (next?.added) i++;
    } else if (c.added) {
      for (const line of lines) rows.push({ kind: "add", newNo: newNo++, parts: [{ text: line, changed: true }] });
      added += lines.length;
    } else {
      // With ignore options the two sides can differ; show the new side's text.
      for (const line of lines) rows.push({ kind: "same", oldNo: oldNo++, newNo: newNo++, text: line });
    }
  }
  return { rows, added, removed };
}
