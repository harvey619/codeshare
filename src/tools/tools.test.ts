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

import {
  base64Decode, base64Encode, contrast, decodeJwt, formatBytes, fromHsl, htmlDecode, htmlEncode,
  parseHex, parsePageRanges, parseTimestamp, randomString, shades, toHex, toHsl,
} from "./lib";

describe("colour", () => {
  it("parses and prints hex", () => {
    expect(parseHex("#7c5cff")).toEqual({ r: 124, g: 92, b: 255 });
    expect(parseHex("fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("nope")).toBeNull();
    expect(toHex({ r: 124, g: 92, b: 255 })).toBe("#7c5cff");
  });
  it("converts to and from HSL", () => {
    expect(toHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(fromHsl(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 });
    expect(toHex(fromHsl(0, 0, 100))).toBe("#ffffff");
  });
  it("computes WCAG contrast", () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
    expect(contrast({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(4.48, 1);
  });
  it("makes nine shades, light to dark", () => {
    const s = shades({ r: 124, g: 92, b: 255 });
    expect(s).toHaveLength(9);
    expect(toHsl(parseHex(s[0])!).l).toBeGreaterThan(toHsl(parseHex(s[8])!).l);
  });
});

describe("encode", () => {
  it("round-trips unicode through base64", () => {
    expect(base64Decode(base64Encode("héllo 👋"))).toBe("héllo 👋");
    expect(base64Decode("aGk")).toBe("hi"); // missing padding
    expect(() => base64Decode("!!!")).toThrow();
  });
  it("encodes and decodes HTML entities", () => {
    expect(htmlEncode(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
    expect(htmlDecode("&lt;b&gt; &amp; &#233; &#x1F600;")).toBe("<b> & é 😀");
  });
  it("decodes a JWT", () => {
    const jwt = `${base64Encode('{"alg":"HS256"}')}.${base64Encode('{"sub":"42","exp":1}')}.sig`;
    expect(decodeJwt(jwt)).toEqual({ header: { alg: "HS256" }, payload: { sub: "42", exp: 1 } });
    expect(() => decodeJwt("abc")).toThrow();
  });
});

describe("generators, pdf ranges, time, sizes", () => {
  it("builds random strings from the alphabet only", () => {
    const s = randomString(200, "ab");
    expect(s).toMatch(/^[ab]{200}$/);
    expect(s).toContain("a");
    expect(s).toContain("b");
  });
  it("parses page ranges", () => {
    expect(parsePageRanges("1-3, 5, 8-", 10)).toEqual([0, 1, 2, 4, 7, 8, 9]);
    expect(parsePageRanges("-2", 5)).toEqual([0, 1]);
    expect(() => parsePageRanges("4-12", 10)).toThrow();
    expect(() => parsePageRanges("x", 10)).toThrow();
    expect(() => parsePageRanges(" ", 10)).toThrow();
  });
  it("reads timestamps in seconds or milliseconds", () => {
    expect(parseTimestamp("1700000000")!.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(parseTimestamp("1700000000000")!.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(parseTimestamp("soon")).toBeNull();
  });
  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
