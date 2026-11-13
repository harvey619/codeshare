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

test("picker goes through everyone before repeating, and the list is remembered", async ({ page }) => {
  await page.goto("/tools/picker");
  await page.locator("#picker-names").fill("Ana\nBen\nCy");
  const name = page.locator(".picker-name");
  const pickBtn = page.getByRole("button", { name: "Pick a student" });

  const got = new Set<string>();
  for (let i = 0; i < 3; i++) {
    await pickBtn.click();
    await expect(pickBtn).toBeEnabled(); // shuffle finished
    got.add((await name.innerText()).trim());
  }
  expect([...got].sort()).toEqual(["Ana", "Ben", "Cy"]);
  await expect(page.getByText("Everyone's had a turn")).toBeVisible();

  await page.reload();
  await expect(page.locator("#picker-names")).toHaveValue("Ana\nBen\nCy");
});

test("timer counts down and finishes", async ({ page }) => {
  await page.goto("/tools/picker");
  await page.getByLabel("Minutes").fill("0.1"); // 6 seconds
  await expect(page.locator(".timer")).toHaveText("0:06");
  await page.getByRole("button", { name: "Start" }).click();
  await expect.poll(() => page.locator(".timer").innerText(), { timeout: 4000 }).not.toBe("0:06");
  await expect(page.getByText("Time's up!")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".timer")).toHaveText("0:00");
});

test("JSON tool formats, minifies and points at errors", async ({ page }) => {
  await page.goto("/tools/json");
  const area = page.getByLabel("JSON");
  await area.fill('{"b":1,"a":[1,2]}');
  await expect(page.locator(".json-status")).toContainText("Valid JSON (object, 2 keys)");

  await page.getByLabel("Sort keys").check();
  await page.getByRole("button", { name: "Format" }).click();
  await expect(area).toHaveValue('{\n  "a": [\n    1,\n    2\n  ],\n  "b": 1\n}');
  await page.getByRole("button", { name: "Minify" }).click();
  await expect(area).toHaveValue('{"a":[1,2],"b":1}');

  await area.fill('{\n  "a": 1,\n}');
  await expect(page.locator(".json-status")).toContainText("Line 3");
  await expect(page.getByRole("button", { name: "Format" })).toBeDisabled();
});

test("diff checker shows added and removed lines", async ({ page }) => {
  await page.goto("/tools/diff");
  const left = page.getByLabel("Original");
  const right = page.getByLabel("Changed");
  await left.fill("a\nb\nc\n");
  await right.fill("a\nB\nc\nd\n");
  await expect(page.locator(".diff-summary")).toHaveText("+2 −1");
  await expect(page.locator(".diff-row.del")).toHaveCount(1);
  await expect(page.locator(".diff-row.add")).toHaveCount(2);

  await page.getByLabel("Ignore case").check();
  await expect(page.locator(".diff-summary")).toHaveText("+1 −0");
  await right.fill("a\nb\nc\n");
  await expect(page.locator(".diff-summary")).toHaveText("No differences");
});
