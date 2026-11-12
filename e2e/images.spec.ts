import { test, expect } from "@playwright/test";

test("pasted image appears for others", async ({ browser }) => {
  const room = `/e2e-${Date.now()}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto(room);
  await b.goto(room);
  await expect(a.locator(".status")).toHaveText("live");

  await a.locator(".cm-content").click();
  await a.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#7c5cff";
    ctx.fillRect(0, 0, 40, 40);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));

    const data = new DataTransfer();
    data.items.add(new File([blob], "square.png", { type: "image/png" }));
    document
      .querySelector(".cm-content")!
      .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  await expect(b.locator(".thumb")).toHaveCount(1, { timeout: 5000 });
  await expect(b.locator(".thumb img")).toHaveJSProperty("naturalWidth", 40);
  await expect(a.locator(".cm-content")).not.toContainText("square");
});

test("svg and oversized are refused", async ({ request }) => {
  const url = `/api/rooms/e2e-${Date.now()}/images`;

  const svg = await request.post(url, {
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  expect(svg.status()).toBe(415);

  const big = Buffer.alloc(2 * 1024 * 1024);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big);
  const oversized = await request.post(url, { data: big });
  expect(oversized.status()).toBe(413);
});