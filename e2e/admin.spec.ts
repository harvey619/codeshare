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
  expect((await request.get("/api/admin/rooms")).status()).toBe(401);
  expect((await request.get("/api/admin/rooms", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.post("/api/admin/rooms/now/delete")).status()).toBe(401);
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
