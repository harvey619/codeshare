import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

// A small solid PNG made in the page, as a file payload.
async function png(page: Page, w: number, h: number, colour = "#7c5cff") {
  const b64 = await page.evaluate(
    ([w, h, colour]) => {
      const c = document.createElement("canvas");
      c.width = w as number;
      c.height = h as number;
      const x = c.getContext("2d")!;
      x.fillStyle = colour as string;
      x.fillRect(0, 0, c.width, c.height);
      return c.toDataURL("image/png").split(",")[1];
    },
    [w, h, colour] as const,
  );
  return Buffer.from(b64, "base64");
}

test("tools index: search, categories and favourites", async ({ page }) => {
  await page.goto("/tools");
  await expect(page.locator(".tool-card")).toHaveCount(16);
  await page.getByLabel("Search tools").fill("pdf");
  await expect(page.locator(".tool-card strong")).toHaveText(["Markdown to PDF", "PDF tools"]);
  await page.getByLabel("Search tools").fill("");
  await page.getByRole("button", { name: "Colour", exact: true }).click();
  await expect(page.locator(".tool-card strong")).toHaveText(["Colour picker & contrast"]);

  await page.getByRole("button", { name: /Add Colour picker & contrast to favourites/ }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your favourites" })).toBeVisible();
  await page.getByLabel("Search tools").fill("regex");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tools\/regex$/);
});

test("regex tester finds matches and reports bad patterns", async ({ page }) => {
  await page.goto("/tools/regex");
  await expect(page.locator(".json-status")).toHaveText("2 matches");
  await expect(page.locator(".regex-out mark")).toHaveText(["ana@school.com", "BEN@class.com"]);
  await expect(page.locator(".grid-table tbody tr").first()).toContainText("school");
  await page.getByLabel("Pattern").fill("(unclosed");
  await expect(page.locator(".json-status.bad")).toBeVisible();
});

test("encode & decode: Base64, URL and JWT", async ({ page }) => {
  await page.goto("/tools/encode");
  const input = page.getByLabel("Input");
  const output = page.locator('textarea[aria-label="Output"]');
  await input.fill("héllo 👋");
  await expect(output).toHaveValue("aMOpbGxvIPCfkYs=");
  await page.getByRole("button", { name: "⇅ Swap" }).click();
  await expect(output).toHaveValue("héllo 👋");

  await page.getByRole("button", { name: "URL", exact: true }).click();
  await page.getByRole("button", { name: "Encode", exact: true }).click();
  await input.fill("a b&c");
  await expect(output).toHaveValue("a%20b%26c");

  await page.getByRole("button", { name: "JWT", exact: true }).click();
  await page.getByLabel("Token").fill("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiIsIm5hbWUiOiJBbmEifQ.sig");
  await expect(output).toHaveValue(/"name": "Ana"/);
  await page.getByLabel("Token").fill("not-a-token");
  await expect(page.locator(".json-status.bad")).toContainText("three parts");
});

test("generators: UUIDs, passwords and hashes", async ({ page }) => {
  await page.goto("/tools/generate");
  await expect(page.getByLabel("UUIDs")).toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const pw = page.getByLabel("Password", { exact: true });
  await expect(pw).toHaveText(/^[A-Za-z0-9]{16}$/);
  const first = await pw.innerText();
  await page.getByRole("button", { name: "New password" }).click();
  await expect(pw).not.toHaveText(first);
  await page.getByLabel("Text to hash").fill("abc");
  await expect(page.getByLabel("Hash", { exact: true })).toHaveText("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("timestamp converter", async ({ page }) => {
  await page.goto("/tools/time");
  await page.getByLabel("Unix timestamp").fill("1700000000");
  await expect(page.getByText("2023-11-14T22:13:20.000Z")).toBeVisible();
  await page.getByLabel("Unix timestamp").fill("soon");
  await expect(page.locator(".json-status.bad")).toBeVisible();
});

test("markdown renders safely", async ({ page }) => {
  await page.goto("/tools/markdown");
  await page.getByLabel("Markdown").fill('# Title\n\n**bold** <img src=x onerror="window.pwned=1"> <script>window.pwned=1</script>\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  const preview = page.getByLabel("Preview");
  await expect(preview.locator("h1")).toHaveText("Title");
  await expect(preview.locator("strong")).toHaveText("bold");
  await expect(preview.locator("td")).toHaveText(["1", "2"]);
  await expect(preview.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
});

test("image compressor converts and shrinks", async ({ page }) => {
  await page.goto("/tools/image");
  await page.getByRole("button", { name: "JPEG", exact: true }).click();
  await page.locator('.tools input[type="file"]').setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: await png(page, 600, 400) },
    { name: "two.png", mimeType: "image/png", buffer: await png(page, 300, 300, "#22aa55") },
  ]);
  await expect(page.locator(".img-list li")).toHaveCount(2);
  await expect(page.locator(".img-name")).toHaveText(["one.jpg", "two.jpg"]);
  const download = page.waitForEvent("download");
  await page.locator(".img-list li").first().getByRole("button", { name: "Download" }).click();
  const file = await readFile(await (await download).path());
  expect([...file.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG magic bytes
});

test("resize & crop outputs the chosen size", async ({ page }) => {
  await page.goto("/tools/crop");
  await page.locator('.tools input[type="file"]').setInputFiles({ name: "pic.png", mimeType: "image/png", buffer: await png(page, 800, 400) });
  await page.getByRole("button", { name: "Square" }).click();
  await expect(page.getByLabel("Output width")).toHaveValue("400");
  await page.getByRole("button", { name: "50%" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("pic-200x200.png");
  const file = await readFile(await d.path());
  expect(file.readUInt32BE(16)).toBe(200); // PNG width
  expect(file.readUInt32BE(20)).toBe(200); // PNG height
});

test("colour picker and contrast", async ({ page }) => {
  await page.goto("/tools/colour");
  await page.getByLabel("Colour hex").fill("#ff0000");
  await expect(page.getByText("rgb(255, 0, 0)")).toBeVisible();
  await expect(page.getByText("hsl(0, 100%, 50%)")).toBeVisible();
  await expect(page.locator(".ratio")).toHaveText(/1[5-9]\.\d\d : 1/);
  await page.getByLabel("Text hex").fill("#999999");
  await expect(page.locator(".badge").first()).toHaveText("Normal text: Fail");
});

test("PDF tools: images to PDF, merge and extract", async ({ page }) => {
  await page.goto("/tools/pdf");
  const input = page.locator('.tools input[type="file"]');

  await page.getByRole("button", { name: "Images to PDF" }).click();
  await input.setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: await png(page, 200, 100) },
    { name: "b.png", mimeType: "image/png", buffer: await png(page, 100, 200) },
  ]);
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Make PDF" }).click();
  const twoPages = await readFile(await (await download).path());
  expect((await PDFDocument.load(twoPages)).getPageCount()).toBe(2);

  await page.getByRole("button", { name: "Merge PDFs" }).click();
  await input.setInputFiles([
    { name: "x.pdf", mimeType: "application/pdf", buffer: twoPages },
    { name: "y.pdf", mimeType: "application/pdf", buffer: twoPages },
  ]);
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Merge and download" }).click();
  const merged = await readFile(await (await download).path());
  expect((await PDFDocument.load(merged)).getPageCount()).toBe(4);

  await page.getByRole("button", { name: "Extract pages" }).click();
  await input.setInputFiles({ name: "m.pdf", mimeType: "application/pdf", buffer: merged });
  await expect(page.getByLabel("Pages to keep")).toHaveValue("1-4");
  await page.getByLabel("Pages to keep").fill("2, 4");
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Extract and download" }).click();
  expect((await PDFDocument.load(await readFile(await (await download).path()))).getPageCount()).toBe(2);
  await page.getByLabel("Pages to keep").fill("9");
  await page.getByRole("button", { name: "Extract and download" }).click();
  await expect(page.locator(".json-status.bad")).toContainText("outside pages 1-4");
});

// Pyodide comes from a CDN, so a slow network can stall this: allow retries.
test.describe("python", () => {
  test.describe.configure({ retries: 2 });
  test("python playground runs code", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/tools/python");
    await page.locator(".py-editor .cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText('n = int(input("Number? "))\nprint(n * 7)');
    await page.getByRole("button", { name: /Run/ }).click();
    const ask = page.getByLabel("Program input");
    await expect(ask).toBeVisible({ timeout: 180_000 });
    await ask.fill("6");
    await ask.press("Enter");
    await expect(page.locator(".py-output .out")).toHaveText(["Number? 6", "42"]);
  });
});

test("whiteboard loads, draws and remembers the drawing", async ({ page }) => {
  await page.goto("/tools/whiteboard");
  const canvas = page.locator(".board canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.locator('label:has([data-testid="toolbar-rectangle"])').click();
  const box = (await canvas.boundingBox())!;
  // Start well right of the style panel that opens on the left.
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + 320, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("tools.whiteboard") ?? "{}").elements?.length ?? 0))
    .toBe(1);
  await page.reload();
  await expect(page.locator(".board canvas.interactive")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("tools.whiteboard")!).elements[0].type)).toBe("rectangle");
});
