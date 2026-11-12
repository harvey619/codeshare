import { test, expect, type Locator } from "@playwright/test";

// Read the document, not the screen (the screen also shows other people's cursors).
const docText = (editor: Locator) =>
  editor.evaluate((el) =>
    [...el.querySelectorAll(".cm-line")]
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".cm-ySelectionCaret").forEach((c) => c.remove());
        return copy.textContent;
      })
      .join("\n"),
  );

test("concurrent typing converges", async ({ browser }) => {
  const room = `/e2e-${Date.now()}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto(room);
  await b.goto(room);

  const editorA = a.locator(".cm-content");
  const editorB = b.locator(".cm-content");
  await editorA.click();
  await editorB.click();

  await Promise.all([
    editorA.pressSequentially("aaaa", { delay: 50 }),
    editorB.pressSequentially("bbbb", { delay: 50 }),
  ]);
  await a.waitForTimeout(1000);

  const textA = await docText(editorA);
  const textB = await docText(editorB);
  expect(textA).toBe(textB);
  expect(textA.match(/a/g)?.length).toBe(4);
  expect(textA.match(/b/g)?.length).toBe(4);
});

test("offline edits merge on reconnect", async ({ browser }) => {
  const room = `/e2e-${Date.now()}`;
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await (await browser.newContext()).newPage();
  await a.goto(room);
  await b.goto(room);
  await expect(a.locator(".status")).toHaveText("live");
  await expect(b.locator(".status")).toHaveText("live");

  const editorA = a.locator(".cm-content");
  const editorB = b.locator(".cm-content");

  await ctxA.setOffline(true);
  await editorA.click();
  await editorA.pressSequentially("x1");
  await editorB.click();
  await editorB.pressSequentially("y1");
  await a.waitForTimeout(1500);
  // Proof A is really cut off: it hasn't seen B's edit.
  expect(await docText(editorA)).not.toContain("y1");
  await ctxA.setOffline(false);

  for (const editor of [editorA, editorB]) {
    await expect.poll(() => docText(editor), { timeout: 3000 }).toContain("x1");
    await expect.poll(() => docText(editor), { timeout: 3000 }).toContain("y1");
  }
});

test("content survives everyone leaving", async ({ browser }) => {
  const room = `/e2e-${Date.now()}`;
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(room);
  await expect(a.locator(".status")).toHaveText("live");
  await a.locator(".cm-content").click();
  await a.locator(".cm-content").pressSequentially("keep me");
  await a.waitForTimeout(6000);
  await ctx.close();

  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(room);
  await expect.poll(() => docText(fresh.locator(".cm-content")), { timeout: 5000 }).toContain("keep me");
});