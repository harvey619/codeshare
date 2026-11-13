import { test, expect } from "@playwright/test";

test("uploaded file appears for others and downloads intact", async ({ browser }) => {
  const room = `/e2e-${Date.now()}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto(room);
  await b.goto(room);
  await expect(a.locator(".status")).toHaveText("live");
  await expect(b.locator(".status")).toHaveText("live");

  const bytes = Buffer.alloc(3_200_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
  await a.locator('.sidebar input[type="file"]').setInputFiles({
    name: "notes.zip",
    mimeType: "application/zip",
    buffer: bytes,
  });

  const link = b.locator(".file", { hasText: "notes.zip" });
  await expect(link).toBeVisible({ timeout: 15_000 });

  const href = await link.getAttribute("href");
  const res = await b.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect(res.headers()["content-disposition"]).toContain("notes.zip");
  expect(Buffer.compare(await res.body(), bytes)).toBe(0);
});

test("files over 10 MB are refused", async ({ request }) => {
  const res = await request.post(`/api/rooms/e2e-${Date.now()}/files`, {
    data: Buffer.alloc(11_000_000, 1),
    headers: { "X-File-Name": "big.bin" },
  });
  expect(res.status()).toBe(413);
});
