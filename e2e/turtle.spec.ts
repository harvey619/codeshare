import { test, expect, type Page } from "@playwright/test";

// Python's turtle, drawn in the browser. Pyodide comes from a CDN: allow retries.
test.describe.configure({ retries: 2 });

async function runPython(page: Page, code: string) {
  await page.locator(".py-editor .cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
  await page.getByRole("button", { name: /Run/ }).click();
}

/** The colour of the finished drawing at turtle coordinates (x, y). */
function pixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>(".turtle-layer")!;
      const scale = c.width / 800;
      const d = c.getContext("2d")!.getImageData(Math.round((400 + x) * scale), Math.round((300 - y) * scale), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    [x, y],
  );
}

test("turtle draws a filled square like desktop Python", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/tools/python");
  await runPython(
    page,
    [
      "import turtle",
      "t = turtle.Turtle()",
      "t.speed(0)",
      't.color("red", "yellow")',
      "t.pensize(3)",
      "t.begin_fill()",
      "for _ in range(4):",
      "    t.forward(100)",
      "    t.left(90)",
      "t.end_fill()",
      "print(t.position(), t.heading())",
      "turtle.done()",
    ].join("\n"),
  );
  await expect(page.locator(".py-output .out")).toHaveText(["(0.00,0.00) 0.0"], { timeout: 180_000 });
  await expect(page.locator(".turtle-stage")).toBeVisible();
  await expect.poll(() => pixel(page, 50, 50)).toEqual([255, 255, 0]); // filled yellow
  await expect.poll(() => pixel(page, 50, 0)).toEqual([255, 0, 0]); // red outline
  await expect.poll(() => pixel(page, 150, 50)).toEqual([255, 255, 255]); // white outside
});

test("turtle animates at normal speed, module functions and star import work", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/tools/python");
  await runPython(
    page,
    [
      "from turtle import *",
      'bgcolor("black")',
      'color("cyan")',
      "pensize(4)",
      "for i in range(6):",
      "    forward(80)",
      "    right(60)",
      "hideturtle()",
      'print("done", round(xcor()), round(ycor()), isvisible())',
      "done()",
    ].join("\n"),
  );
  // Python finishes first; the drawing keeps animating and Stop stays until it ends.
  await expect(page.locator(".py-output .out")).toHaveText(["done 0 0 False"], { timeout: 180_000 });
  await expect(page.getByRole("button", { name: /Run/ })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => pixel(page, 40, 0)).toEqual([0, 255, 255]);
  await expect.poll(() => pixel(page, 0, 40)).toEqual([0, 0, 0]);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
});
