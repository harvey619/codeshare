import { describe, it, expect } from "vitest";
import { makeViewToken, readViewToken } from "./viewToken";

const SECRET = "q6v0bS6uI2b4bQf3cFq3o3y6Wm2n8xk4Jz9u1Yb7Ztg=";

describe("view tokens", () => {
  it("round-trips and is stable", async () => {
    const t = await makeViewToken(SECRET, "class-1");
    expect(await readViewToken(SECRET, t)).toBe("class-1");
    expect(await makeViewToken(SECRET, "class-1")).toBe(t);
    expect(t).not.toContain("class");
  });

  it("differs per room", async () => {
    expect(await makeViewToken(SECRET, "a")).not.toBe(await makeViewToken(SECRET, "b"));
  });

  it("rejects tampering, junk and the wrong secret", async () => {
    const t = await makeViewToken(SECRET, "class-1");
    const flipped = t.slice(0, -2) + (t.at(-2) === "A" ? "B" : "A") + t.at(-1);
    expect(await readViewToken(SECRET, flipped)).toBeNull();
    expect(await readViewToken(SECRET, "not a token!")).toBeNull();
    expect(await readViewToken("Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eHF1dXg=", t)).toBeNull();
  });
});
