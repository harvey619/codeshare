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

/** Click the drawing at turtle coordinates (x, y). */
async function clickAt(page: Page, x: number, y: number) {
  const box = (await page.locator(".turtle-layer").last().boundingBox())!;
  const scale = Math.min(box.width / 800, box.height / 600);
  const left = box.x + (box.width - 800 * scale) / 2;
  const top = box.y + (box.height - 600 * scale) / 2;
  await page.mouse.click(left + (400 + x) * scale, top + (300 - y) * scale);
}

test("keys, clicks and timers keep working after mainloop(), until Stop", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/tools/python");
  await runPython(
    page,
    [
      "import turtle",
      "t = turtle.Turtle()",
      "t.speed(0)",
      "t.pensize(3)",
      "def up():",
      "    t.setheading(90)",
      "    t.forward(50)",
      '    print("up", t.ycor())',
      "def click(x, y):",
      "    t.goto(x, y)",
      '    print("click", round(x), round(y))',
      "s = turtle.Screen()",
      's.onkey(up, "Up")',
      "s.onscreenclick(click)",
      "s.listen()",
      's.ontimer(lambda: print("timer"), 100)',
      "turtle.mainloop()",
    ].join("\n"),
  );
  const out = page.locator(".py-output .out");
  await expect(out).toHaveText(["timer"], { timeout: 180_000 });
  await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible(); // still listening
  await expect(page.locator(".turtle-stage")).toBeFocused(); // listen() gave it the keyboard
  await page.keyboard.press("ArrowUp");
  await expect(out).toHaveText(["timer", "up 50.0"]);
  await clickAt(page, 100, -50);
  await expect(out).toHaveText(["timer", "up 50.0", "click 100 -50"]);
  await expect.poll(() => pixel(page, 50, 0)).toEqual([0, 0, 0]); // the line from (0, 50) to the click

  // Stop ends it without reloading Python: the next run starts straight away.
  await page.getByRole("button", { name: /Stop/ }).click();
  await expect(page.getByRole("button", { name: /Run/ })).toBeVisible();
  await runPython(page, 'print("again")');
  await expect(out).toHaveText(["again"], { timeout: 5_000 });
});

test("a game loop with tracer(0) and update() reacts to key presses", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/tools/python");
  await runPython(
    page,
    [
      "import turtle",
      "wn = turtle.Screen()",
      "wn.tracer(0)",
      "p = turtle.Turtle()",
      'p.shape("square")',
      "p.penup()",
      "score = 0",
      "def hit():",
      "    global score",
      "    score += 1",
      'wn.onkeypress(hit, "space")',
      "wn.listen()",
      "while score < 3:",
      "    p.setx(p.xcor() + 1)",
      "    wn.update()",
      'print("score", score)',
    ].join("\n"),
  );
  await expect(page.locator(".turtle-stage")).toBeFocused({ timeout: 180_000 });
  for (let i = 0; i < 3; i++) await page.keyboard.press("Space");
  await expect(page.locator(".py-output .out")).toHaveText(["score 3"]);
});

test("playground: code beside output, Tab keys, remembered code", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tools/python");
  const editor = (await page.locator(".py-editor").boundingBox())!;
  const output = (await page.locator(".py-output").boundingBox())!;
  expect(output.x).toBeGreaterThan(editor.x + editor.width - 1); // output on the right
  expect(editor.height).toBeGreaterThan(450);

  await page.locator(".py-editor .cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("if True:\nx = 1");
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect(page.locator(".py-editor .cm-line").nth(1)).toHaveText("    x = 1");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".py-editor .cm-line").nth(1)).toHaveText("x = 1");

  await page.reload();
  await expect(page.locator(".py-editor .cm-line").nth(1)).toHaveText("x = 1");
});

test("every turtle example runs without errors", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/tools/python");
  const { PY_EXAMPLES } = await import("../src/tools/pyExamples");
  page.on("dialog", (d) => d.accept());
  for (const ex of PY_EXAMPLES.filter((e) => e.group !== "Basics")) {
    await page.getByLabel("Examples").selectOption(ex.id);
    await expect(page.locator(".py-editor .cm-content")).toContainText(ex.code.split("\n")[0]);
    await page.getByRole("button", { name: /Run/ }).click();
    await expect(page.locator(".turtle-stage")).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(800);
    // Play a little: click the drawing, then keys (Snake heads up into the food).
    await page.locator(".turtle-stage").click();
    for (const key of ["ArrowUp", "w", "Space", "ArrowRight"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(500);
    }
    await expect(page.locator(".py-output"), ex.name).not.toContainText(/Error|Traceback/);
    const stop = page.getByRole("button", { name: /Stop/ });
    if (await stop.isVisible()) await stop.click();
    await expect(page.getByRole("button", { name: /Run/ })).toBeVisible({ timeout: 10_000 });
  }
});
