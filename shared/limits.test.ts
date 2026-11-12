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