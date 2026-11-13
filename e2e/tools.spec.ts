import { test, expect } from "@playwright/test";

test("tools index links to the QR generator", async ({ page }) => {
  await page.goto("/tools");
  await expect(page).toHaveURL(/\/tools$/);
  await page.getByRole("link", { name: /QR code/ }).click();
  await expect(page).toHaveURL(/\/tools\/qr$/);
  await expect(page.getByRole("heading", { name: "QR code" })).toBeVisible();
});

test("QR generator previews and downloads", async ({ page }) => {
  await page.goto("/tools/qr");
  const preview = page.locator(".qr-preview img");
  await expect(preview).toBeVisible();
  const first = await preview.getAttribute("src");

  await page.locator("#qr-text").fill("https://harveycodes.com/class-1");
  await expect.poll(() => preview.getAttribute("src")).not.toBe(first);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  expect((await download).suggestedFilename()).toBe("qr-code.png");

  await page.locator("#qr-text").fill("");
  await expect(preview).toHaveCount(0);
});

test("rooms don't load tool code, and tools is never a room", async ({ page, request }) => {
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
  await page.goto(`/e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await expect(page.locator(".status")).toHaveText("live");
  expect(scripts.some((u) => /QrTool|ToolsPage/.test(u))).toBe(false);

  expect((await request.get("/parties/room/tools")).status()).toBe(400);
  expect((await request.get("/parties/room/tools-qr")).status()).toBe(400);
  expect((await request.post("/api/rooms/tools/files", { data: "x" })).status()).toBe(400);
});

test("background remover page loads and rejects non-images", async ({ page }) => {
  const models: string[] = [];
  page.on("request", (r) => /huggingface\.co|jsdelivr/.test(r.url()) && models.push(r.url()));
  await page.goto("/tools/bg");
  await expect(page.getByRole("heading", { name: "Background remover" })).toBeVisible();

  await page.locator('.bg input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.locator(".side-note.error")).toHaveText("That isn't an image.");
  // Nothing heavy is fetched until a real image is given.
  expect(models).toEqual([]);
});
