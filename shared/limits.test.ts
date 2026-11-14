import { describe, it, expect } from "vitest";
import { normalizeRoomName, randomRoomName, TokenBucket } from "./limits";

describe("normalizeRoomName", () => {
  it("lowercases", () => {
    expect(normalizeRoomName("My-Room")).toBe("my-room");
  });

  it("turns runs of invalid chars into one dash and trims dashes", () => {
    expect(normalizeRoomName("Hello World!")).toBe("hello-world");
  });

  it("cuts to 40 chars", () => {
    expect(normalizeRoomName("x".repeat(200))).toBe("x".repeat(40));
  });

  it("reserves the tools prefix", () => {
    expect(normalizeRoomName("tools")).toBeNull();
    expect(normalizeRoomName("tools/qr")).toBeNull();
    expect(normalizeRoomName("toolshed")).toBe("toolshed");
    expect(normalizeRoomName("view/abc")).toBeNull();
    expect(normalizeRoomName("viewer")).toBe("viewer");
  });

  it("returns null when nothing usable is left", () => {
    expect(normalizeRoomName("")).toBeNull();
    expect(normalizeRoomName("!!!")).toBeNull();
  });
});

describe("randomRoomName", () => {
  it("is 6 chars of a-z0-9", () => {
    expect(randomRoomName()).toMatch(/^[a-z0-9]{6}$/);
  });
});

describe("TokenBucket", () => {
  it("allows a burst, refuses, then refills over time", () => {
    let time = 0;
    const bucket = new TokenBucket(30, 60, () => time);

    for (let i = 0; i < 60; i++) expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);

    time += 1000;
    for (let i = 0; i < 30; i++) expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });
});
import { cleanFileName, dedupeTabs, languageOf, legacyMainName, textKey, withLanguage } from "./files";

describe("files", () => {
  it("maps extensions to languages", () => {
    expect(languageOf("main.py")).toBe("Python");
    expect(languageOf("INDEX.HTML")).toBe("HTML");
    expect(languageOf("notes")).toBe("Plain text");
  });

  it("swaps the extension for a language", () => {
    expect(withLanguage("main.js", "Python")).toBe("main.py");
    expect(withLanguage("README", "CSS")).toBe("README.css");
  });

  it("names the first file of old rooms from their language", () => {
    expect(legacyMainName(undefined)).toBe("main.js");
    expect(legacyMainName("Python")).toBe("main.py");
    expect(legacyMainName("HTML")).toBe("index.html");
  });

  it("cleans file names", () => {
    expect(cleanFileName(" my file!.py ")).toBe("my-file-.py");
    expect(cleanFileName("../../etc")).toBe("etc");
    expect(cleanFileName("***")).toBeNull();
  });

  it("keeps the first file in the legacy text and dedupes tabs", () => {
    expect(textKey("main")).toBe("code");
    expect(textKey("ab12")).toBe("file:ab12");
    expect(dedupeTabs([{ id: "main", name: "a" }, { id: "main", name: "b" }, { id: "x", name: "c" }]).map((t) => t.name)).toEqual(["a", "c"]);
  });
});
