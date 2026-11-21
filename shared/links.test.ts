import { describe, it, expect } from "vitest";
import { checkTarget, isLive, normalizeSlug } from "./links";

describe("normalizeSlug", () => {
  it("lowercases and dashes", () => {
    expect(normalizeSlug("Claude Drive!")).toBe("claude-drive");
  });
  it("rejects empty names", () => {
    expect(normalizeSlug("  !! ")).toBeNull();
  });
  it("cuts to 40 chars", () => {
    expect(normalizeSlug("a".repeat(60))).toBe("a".repeat(40));
  });
});

describe("checkTarget", () => {
  it("keeps https links", () => {
    expect(checkTarget("https://drive.google.com/x?y=1")).toEqual({ url: "https://drive.google.com/x?y=1" });
  });
  it("adds https:// when it's missing", () => {
    expect(checkTarget("docs.google.com/forms/abc")).toEqual({ url: "https://docs.google.com/forms/abc" });
  });
  it("refuses other schemes", () => {
    expect(checkTarget("javascript:alert(1)")).toHaveProperty("error");
    expect(checkTarget("data:text/html,hi")).toHaveProperty("error");
    expect(checkTarget("ftp://x.com")).toHaveProperty("error");
  });
  it("refuses empty, junk and loops", () => {
    expect(checkTarget("")).toHaveProperty("error");
    expect(checkTarget("https://")).toHaveProperty("error");
    expect(checkTarget("https://harveycodes.com/go/other", "harveycodes.com")).toHaveProperty("error");
    expect(checkTarget("https://harveycodes.com/my-room", "harveycodes.com")).toEqual({ url: "https://harveycodes.com/my-room" });
  });
});

describe("isLive", () => {
  it("works with and without an expiry", () => {
    expect(isLive({ expires: null })).toBe(true);
    expect(isLive({ expires: 100 }, 50)).toBe(true);
    expect(isLive({ expires: 100 }, 150)).toBe(false);
  });
});
