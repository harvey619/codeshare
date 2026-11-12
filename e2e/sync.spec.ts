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