import { describe, it, expect } from "vitest";
import { formatTime, parseNames, pickNext } from "./picker";
import { checkJson, formatJson, lineColumn } from "./json";
import { diffRows } from "./diff";

describe("picker", () => {
  it("parses names, dropping blanks and duplicates", () => {
    expect(parseNames(" Ana \n\nben\nAna\nBen\n Cy")).toEqual(["Ana", "ben", "Cy"]);
  });

  it("picks everyone once before repeating", () => {
    const names = ["a", "b", "c"];
    let picked: string[] = [];
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = pickNext(names, picked)!;
      got.push(r.name);
      picked = r.picked;
    }
    expect([...got].sort()).toEqual(names);
    expect(pickNext(names, picked)!.left).toBe(2); // new round
  });

  it("never repeats the last person at the start of a new round", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickNext(["a", "b"], ["a", "b"])!.name).toBe("a");
    }
  });

  it("returns null with nobody to pick", () => {
    expect(pickNext([], [])).toBeNull();
  });

  it("formats time", () => {
    expect(formatTime(754_000)).toBe("12:34");
    expect(formatTime(500)).toBe("0:01");
    expect(formatTime(-5)).toBe("0:00");
  });
});

describe("json", () => {
  it("finds line and column", () => {
    expect(lineColumn('{\n  "a": 1,\n}', 12)).toEqual({ line: 3, column: 1 });
  });

  it("reports a syntax error with a location", () => {
    const r = checkJson('{\n  "a": 1,\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(3);
  });

  it("formats, minifies and sorts keys", () => {
    const v = { b: 1, a: { d: 2, c: [3] } };
    expect(formatJson(v, 0)).toBe('{"b":1,"a":{"d":2,"c":[3]}}');
    expect(formatJson(v, 0, true)).toBe('{"a":{"c":[3],"d":2},"b":1}');
    expect(formatJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
  });
});

describe("diff", () => {
  it("numbers lines and counts changes", () => {
    const { rows, added, removed } = diffRows("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(rows.map((r) => r.kind)).toEqual(["same", "del", "add", "same", "add"]);
    expect([added, removed]).toEqual([2, 1]);
    const last = rows[rows.length - 1];
    expect(last.kind === "add" && last.newNo).toBe(4);
  });

  it("highlights the changed word in a replaced line", () => {
    const { rows } = diffRows("let x = 1;\n", "let y = 1;\n");
    const del = rows.find((r) => r.kind === "del")!;
    expect(del.kind === "del" && del.parts.filter((p) => p.changed).map((p) => p.text)).toEqual(["x"]);
  });

  it("can ignore whitespace", () => {
    expect(diffRows("a  b\n", "a b\n", { ignoreWhitespace: true, ignoreCase: false }).added).toBe(0);
  });
});
