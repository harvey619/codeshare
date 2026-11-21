import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Locally the token comes from .dev.vars; against production pass ADMIN_TOKEN=... in the environment.
function adminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  if (process.env.BASE_URL) return null;
  try {
    return readFileSync(".dev.vars", "utf8").match(/ADMIN_TOKEN="([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

test("admin API refuses without the token", async ({ request }) => {
  // 401 = wrong token; 503 = no ADMIN_TOKEN secret set yet (also refused).
  const refused = [401, 503];
  expect(refused).toContain((await request.get("/api/admin/rooms")).status());
  expect(refused).toContain((await request.get("/api/admin/rooms", { headers: { Authorization: "Bearer wrong" } })).status());
  expect(refused).toContain((await request.post("/api/admin/rooms/now/delete")).status());
  // Internal room paths aren't routed to rooms at all (the site just serves its page).
  const internal = await request.post("/internal/admin/delete");
  expect(await internal.text()).not.toContain('"ok"');
});

test("admin dashboard lists rooms, ends sessions and deletes rooms", async ({ browser }) => {
  const token = adminToken();
  test.skip(!token, "no admin token available");
  const room = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const student = await (await browser.newContext()).newPage();
  await student.goto(`/${room}`);
  await expect(student.locator(".status")).toHaveText("live");
  await student.locator(".cm-content").click();
  await student.keyboard.insertText("student work");

  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Admin token").fill(token!);
  await admin.getByRole("button", { name: "Open dashboard" }).click();
  await admin.getByLabel("Filter rooms").fill(room);
  const row = admin.locator("tr", { hasText: `/${room}` });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.locator(".online")).toHaveText(/● [12]/, { timeout: 20_000 }); // dev mode can show 2 (React double-mount)

  // End: the student is disconnected and told why, and doesn't reconnect.
  admin.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "End" }).click();
  await expect(student.locator(".notice")).toContainText("ended this session");
  await expect(student.locator(".status")).toHaveText("offline");
  await student.waitForTimeout(3000);
  await expect(student.locator(".status")).toHaveText("offline");

  // The content survived the End.
  const again = await (await browser.newContext()).newPage();
  await again.goto(`/${room}`);
  await expect(again.locator(".cm-content")).toContainText("student work");

  // Delete: everything is erased and the room leaves the list.
  admin.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(again.locator(".notice")).toContainText("deleted this room");
  await expect(row).toHaveCount(0, { timeout: 20_000 });
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(`/${room}`);
  await expect(fresh.locator(".status")).toHaveText("live");
  await expect(fresh.locator(".cm-content")).not.toContainText("student work");
});

test("clear empty rooms deletes blank rooms and keeps ones with work", async ({ browser, request }) => {
  const token = adminToken();
  test.skip(!token, "no admin token available");
  test.setTimeout(60_000);
  const id = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const blank = id();
  const full = id();
  const auth = { Authorization: `Bearer ${token}` };

  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${blank}`);
  await expect(page.locator(".status")).toHaveText("live");
  await page.waitForTimeout(6000); // the new room saves its first file tab
  await page.goto(`/${full}`);
  await expect(page.locator(".status")).toHaveText("live");
  await page.locator(".cm-content").click();
  await page.keyboard.insertText("keep me");
  await page.waitForTimeout(6000);
  await page.close();

  const names = async () => ((await (await request.get("/api/admin/rooms", { headers: auth })).json()).rooms as { name: string; people: number }[]);
  // Dev mode can leave a phantom connection open (React double-mount): end both rooms first.
  await expect.poll(async () => (await names()).filter((r) => [blank, full].includes(r.name)).length, { timeout: 20_000 }).toBe(2);
  for (const r of [blank, full]) expect((await request.post(`/api/admin/rooms/${r}/end`, { headers: auth })).status()).toBe(200);
  await expect.poll(async () => (await names()).filter((r) => [blank, full].includes(r.name) && r.people === 0).length, { timeout: 20_000 }).toBe(2);

  const res = await request.post("/api/admin/clear-empty", { headers: auth });
  expect(res.status()).toBe(200);
  expect((await res.json()).deleted).toBeGreaterThanOrEqual(1);
  const left = (await names()).map((r) => r.name);
  expect(left).not.toContain(blank);
  expect(left).toContain(full);
});

test("short links: unknown names show a friendly page, admin API needs the token", async ({ request }) => {
  const missing = await request.get(`/go/nope-${Date.now()}`, { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("Link not found");
  expect([401, 503]).toContain((await request.get("/api/admin/links")).status());
  expect([401, 503]).toContain((await request.post("/api/admin/links", { data: { slug: "x", url: "https://example.com" } })).status());
});

test("short links: add, open, count, edit, QR and delete from the admin page", async ({ browser, request }) => {
  const token = adminToken();
  test.skip(!token, "no admin token available");
  const slug = `e2e-${Date.now()}`;
  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Admin token").fill(token!);
  await admin.getByRole("button", { name: "Open dashboard" }).click();

  const panel = admin.getByRole("region", { name: "Short links" });
  await panel.getByLabel("Short name").fill(slug);
  await panel.getByLabel("Long link").fill("example.com/first?a=1");
  await panel.getByLabel("Note (optional)").fill("e2e test link");
  await panel.getByRole("button", { name: "Add link" }).click();
  const row = panel.locator("tr", { hasText: `/go/${slug}` });
  await expect(row).toContainText("example.com/first?a=1");

  // The same name can't be added twice; bad links are refused.
  await panel.getByLabel("Short name").fill(slug);
  await panel.getByLabel("Long link").fill("https://example.com/other");
  await panel.getByRole("button", { name: "Add link" }).click();
  await expect(panel.getByRole("alert")).toContainText("already exists");
  await panel.getByLabel("Short name").fill(`${slug}-bad`);
  await panel.getByLabel("Long link").fill("javascript:alert(1)");
  await panel.getByRole("button", { name: "Add link" }).click();
  await expect(panel.getByRole("alert")).toContainText("https://");
  await panel.getByLabel("Short name").fill("");
  await panel.getByLabel("Long link").fill("");

  // Opening it redirects and is counted.
  const hit = await request.get(`/go/${slug}`, { maxRedirects: 0 });
  expect(hit.status()).toBe(302);
  expect(hit.headers()["location"]).toBe("https://example.com/first?a=1");
  expect((await request.get(`/go/${slug.toUpperCase()}/`, { maxRedirects: 0 })).status()).toBe(302); // case and trailing slash don't matter
  await admin.getByRole("button", { name: "Refresh" }).click();
  await expect(row.locator("td").nth(2)).toHaveText("2");

  // Edit: rename and change where it goes; the old name stops working.
  await row.getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("Short name").fill(`${slug}-new`);
  await panel.getByLabel("Long link").fill("https://example.com/second");
  await panel.getByRole("button", { name: "Save changes" }).click();
  const renamed = panel.locator("tr", { hasText: `/go/${slug}-new` });
  await expect(renamed).toContainText("example.com/second");
  expect((await request.get(`/go/${slug}`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get(`/go/${slug}-new`, { maxRedirects: 0 })).headers()["location"]).toBe("https://example.com/second");

  // QR code.
  await renamed.getByRole("button", { name: "QR" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog.locator("img")).toHaveAttribute("src", /^data:image\/png/);
  await expect(dialog).toContainText(`/go/${slug}-new`);
  await admin.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Delete.
  admin.once("dialog", (d) => d.accept());
  await renamed.getByRole("button", { name: "Delete" }).click();
  await expect(renamed).toBeHidden();
  expect((await request.get(`/go/${slug}-new`, { maxRedirects: 0 })).status()).toBe(404);
});
