import { test, expect, type Page } from "@playwright/test";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";

const newRoom = () => `/e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function openRoom(page: Page, room: string) {
  await page.goto(room);
  await expect(page.locator(".status")).toHaveText("live");
}

async function type(page: Page, text: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(text);
}

// Answers the next prompt() dialog (file names are asked with prompt).
function answer(page: Page, text: string) {
  page.once("dialog", (d) => d.accept(text));
}

test("files: add, switch, rename via language, shared with others", async ({ browser }) => {
  const room = newRoom();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await openRoom(a, room);
  await openRoom(b, room);
  await expect(a.locator(".tab-name")).toHaveText(["notes.md"]);

  await type(a, "first file");
  answer(a, "notes.py");
  await a.getByRole("button", { name: "New file" }).click();
  await expect(a.locator(".tab.active .tab-name")).toHaveText("notes.py");
  await expect(a.getByLabel("Language")).toHaveValue("Python");
  await type(a, "second file");

  await expect(b.locator(".tab-name")).toHaveText(["notes.md", "notes.py"]);
  await expect(b.locator(".cm-content")).toContainText("first file");
  await b.getByRole("tab", { name: "notes.py" }).click();
  await expect(b.locator(".cm-content")).toContainText("second file");
  await expect(b.locator(".cm-content")).not.toContainText("first file");

  await b.getByLabel("Language").selectOption("CSS");
  await expect(a.locator(".tab-name")).toHaveText(["notes.md", "notes.css"]);
});

test("run JavaScript: output, prompt input, errors and stop", async ({ page }) => {
  await openRoom(page, newRoom());
  await type(page, 'const name = prompt("name?");\nconsole.log("hi " + name);\nconsole.log({ a: 1 });\nnope();');
  await page.getByLabel("Language").selectOption("JavaScript");
  await page.getByRole("button", { name: /Run/ }).click();
  await page.getByLabel("Answers").fill("Ana");
  await page.getByRole("button", { name: /Run/ }).click();
  await expect(page.locator(".out").first()).toHaveText("hi Ana");
  await expect(page.locator(".out.error")).toContainText("nope is not defined");

  // An infinite loop must not freeze the page, and Stop must end it.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("while (true) {}");
  await page.getByRole("button", { name: /Run/ }).click();
  await page.getByRole("button", { name: /Stop/ }).click();
  await expect(page.getByText("Stopped.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Run/ })).toBeVisible();
});

test("run HTML with the room's CSS and JS files", async ({ page }) => {
  await openRoom(page, newRoom());
  await page.getByLabel("Language").selectOption("HTML");
  await expect(page.locator(".tab-name")).toHaveText(["notes.html"]);
  await type(page, '<link rel="stylesheet" href="style.css"><h1 id="t">Hello</h1><script src="app.js"></script>');
  answer(page, "style.css");
  await page.getByRole("button", { name: "New file" }).click();
  await type(page, "h1 { color: rgb(255, 0, 0); }");
  answer(page, "app.js");
  await page.getByRole("button", { name: "New file" }).click();
  await type(page, 'document.getElementById("t").textContent += " class"; console.log("ran");');

  await page.getByRole("tab", { name: "notes.html" }).click();
  await page.getByRole("button", { name: /Run/ }).click();
  const h1 = page.frameLocator('iframe[title="Page preview"]').locator("h1");
  await expect(h1).toHaveText("Hello class");
  await expect(h1).toHaveCSS("color", "rgb(255, 0, 0)");
  await page.getByRole("button", { name: /^Output/ }).click();
  await expect(page.locator(".out")).toHaveText(["ran"]);
});

// Pyodide comes from a CDN, so a slow network can stall this: allow retries.
test.describe("python", () => {
  test.describe.configure({ retries: 2 });
  test("run Python", async ({ page }) => {
    test.setTimeout(240_000); // first run downloads Pyodide (about 10 MB)
    await openRoom(page, newRoom());
    await page.getByLabel("Language").selectOption("Python");
    await type(page, 'print("start")\nname = input("Name? ")\nage = int(input("Age? "))\nprint("hi", name, age + 1)\n1/0');
    await page.getByRole("button", { name: /Run/ }).click();
    // The program pauses at each input() and waits for an answer typed into the output.
    const ask = page.getByLabel("Program input");
    await expect(ask).toBeVisible({ timeout: 150_000 });
    await expect(page.locator(".out.ask")).toContainText("Name?");
    await expect(page.locator(".out").first()).toHaveText("start");
    await ask.fill("Ben");
    await ask.press("Enter");
    await expect(page.locator(".out.ask")).toContainText("Age?");
    await ask.fill("12");
    await ask.press("Enter");
    await expect(page.locator(".out.input")).toHaveText(["Name? Ben", "Age? 12"]);
    await expect(page.locator(".out.log").last()).toHaveText("hi Ben 13");
    await expect(page.locator(".out.error")).toContainText("ZeroDivisionError");
  });
});

test("history: restore brings back wiped code", async ({ page, request }) => {
  const room = newRoom();
  await openRoom(page, room);
  await type(page, "precious work");
  // The server saves a few seconds after an edit; the first save makes the first history entry.
  await expect
    .poll(async () => (await (await request.get(`/api/rooms${room}/history`)).json()).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".cm-content")).not.toContainText("precious");

  await page.getByRole("button", { name: "History" }).click();
  await page.locator(".history-item").last().click();
  await expect(page.locator(".history-preview")).toContainText("precious work");
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.locator(".cm-content")).toContainText("precious work");
});

test("view-only link: sees edits live but cannot change anything", async ({ browser, request, baseURL }) => {
  const room = newRoom();
  const a = await (await browser.newContext()).newPage();
  await openRoom(a, room);
  await type(a, "teacher code");

  const link = await request.get(`/api/rooms${room}/view-link`);
  test.skip(link.status() === 503, "VIEW_KEY secret is not set on this deployment");
  const { token } = await link.json();
  expect(token).not.toContain(room.slice(1));
  const v = await (await browser.newContext()).newPage();
  await v.goto(`/view/${token}`);
  await expect(v.locator(".status")).toHaveText("live");
  await expect(v.locator(".cm-content")).toContainText("teacher code");
  await expect(v.locator(".chip")).toHaveText("View only");
  await expect(v.getByRole("button", { name: "New file" })).toHaveCount(0);
  await expect(v.locator(".cm-content")).toHaveAttribute("contenteditable", "false");

  await type(a, " more");
  await expect(v.locator(".cm-content")).toContainText("teacher code more");

  // Even a hand-made client can't write through the view socket: the server drops its edits.
  const host = new URL(baseURL!).host;
  const rogueDoc = new Y.Doc();
  const rogue = new YProvider(host, token, rogueDoc, { party: "view" });
  await expect.poll(() => rogueDoc.getText("code").toString(), { timeout: 10_000 }).toContain("teacher code more");
  rogueDoc.getText("code").insert(0, "HACKED ");
  // A real editor's change arrives; the rogue one never does.
  await type(a, " end");
  await expect(v.locator(".cm-content")).toContainText("more end");
  await expect(a.locator(".cm-content")).not.toContainText("HACKED");
  await expect(v.locator(".cm-content")).not.toContainText("HACKED");
  rogue.destroy();

  expect((await request.post(`/api/view/${token}/files`, { data: "x" })).status()).toBe(404);
  expect((await request.get("/parties/view/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).status()).toBe(404);
});

test("text zoom, raise hand and follow", async ({ browser }) => {
  const room = newRoom();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await openRoom(a, room);
  await openRoom(b, room);

  const size = () => a.locator(".cm-content").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  await a.getByRole("button", { name: "Bigger text" }).click();
  expect(await size()).toBe(before + 2);
  await a.reload();
  await expect(a.locator(".status")).toHaveText("live");
  expect(await size()).toBe(before + 2);

  await a.getByRole("button", { name: "Raise hand" }).click();
  await expect(b.locator("li.person").first()).toContainText("✋");

  // B follows A: when A opens another file, B's screen switches too.
  answer(a, "second.js");
  await a.getByRole("button", { name: "New file" }).click();
  await type(a, "over here");
  await a.getByRole("tab", { name: "notes.md" }).click();
  await expect(b.locator(".tab.active .tab-name")).toHaveText("notes.md");
  await b.locator(".person-btn").first().click();
  await expect(b.getByText(/^Following/)).toBeVisible();
  await a.getByRole("tab", { name: "second.js" }).click();
  await expect(b.locator(".tab.active .tab-name")).toHaveText("second.js");
  await expect(b.locator(".cm-content")).toContainText("over here");
});

test("download gives the file its name, explain validates input", async ({ page, request }) => {
  const room = newRoom();
  await openRoom(page, room);
  await type(page, "let x = 1;");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("notes.md");

  const empty = await request.post(`/api/rooms${room}/explain`, { data: { code: "  " } });
  expect(empty.status()).toBe(400);
  const huge = await request.post(`/api/rooms${room}/explain`, { data: { code: "x".repeat(13_000) } });
  expect(huge.status()).toBe(413);
});

test("the bare domain opens the shared 'now' room, as Markdown notes", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/now$/);
  await expect(page.locator(".room")).toHaveText("/now");
  await page.goto("/!!!");
  await expect(page).toHaveURL(/\/now$/);
});

test("Markdown notes: highlighted, and Preview shows them formatted", async ({ page }) => {
  await openRoom(page, newRoom());
  await expect(page.locator(".tab-name")).toHaveText(["notes.md"]);
  await expect(page.getByLabel("Language")).toHaveValue("Markdown");
  await type(page, "# Today\n\n- **loops**\n- lists");
  await page.getByRole("button", { name: "▶ Preview" }).click();
  const doc = page.frameLocator('iframe[title="Page preview"]');
  await expect(doc.locator("h1")).toHaveText("Today");
  await expect(doc.locator("li strong")).toHaveText("loops");
});

test("text can be made very large", async ({ page }) => {
  await openRoom(page, newRoom());
  const bigger = page.getByRole("button", { name: "Bigger text" });
  while (await bigger.isEnabled()) await bigger.click();
  const size = await page.locator(".cm-content").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBe(64);
  await page.evaluate(() => localStorage.removeItem("codeshare-font-size"));
});
