// Runs student code safely. Everything executes inside a sandboxed iframe (`allow-scripts`
// only, so it gets an opaque origin: no access to this site, its storage or cookies), and
// inside a Web Worker there, so an infinite loop can't freeze the page and Stop can kill it.

// 0.29.x is the last line that runs in a classic worker. Newer Pyodide needs a module worker,
// which browsers won't start from a blob inside a sandboxed (opaque-origin) frame.
export const PYODIDE_VERSION = "0.29.5";
const PYODIDE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type RunFile = { name: string; text: string };
export type OutLine = { stream: "log" | "warn" | "error" | "info" | "input"; text: string };
export type RunEvent =
  | { type: "out"; stream: OutLine["stream"]; text: string }
  | { type: "status"; text: string }
  /** The program called input() and is paused until sendInput(). */
  | { type: "input"; prompt: string }
  /** Whether this browser can pause Python for input() (JSPI), sent once Python is loaded. */
  | { type: "mode"; interactive: boolean }
  | { type: "done"; stopped?: boolean };

// Plain JavaScript console programs. `prompt()` reads lines from the Input box.
const JS_WORKER = `
const fmt = (a) => {
  if (typeof a === "string") return a;
  if (a instanceof Error) return a.stack || String(a);
  try { const s = JSON.stringify(a, null, 2); return s === undefined ? String(a) : s; } catch { return String(a); }
};
const send = (stream, args) => postMessage({ type: "out", stream, text: args.map(fmt).join(" ") });
console.log = console.info = console.debug = console.table = (...a) => send("log", a);
console.warn = (...a) => send("warn", a);
console.error = (...a) => send("error", a);
self.addEventListener("unhandledrejection", (e) => send("error", ["Uncaught (in promise) " + fmt(e.reason)]));
onmessage = async (e) => {
  const lines = e.data.stdin === "" ? [] : e.data.stdin.split("\\n");
  let i = 0;
  self.prompt = () => (i < lines.length ? lines[i++] : null);
  self.alert = (m) => send("info", [String(m)]);
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction(e.data.code)();
  } catch (err) {
    send("error", [err]);
  }
  postMessage({ type: "done" });
};`;

// Python via Pyodide, kept loaded between runs (the first run downloads it).
const PY_WORKER = `
importScripts("${PYODIDE}pyodide.js");
let py = null;
let interactive = false;
let answer = null; // resolves the input() that is waiting
const out = (stream) => ({ batched: (text) => postMessage({ type: "out", stream, text }) });
// Called from Python's input(): ask the page for a line and wait for it.
self.askInput = (prompt) => new Promise((resolve) => {
  answer = resolve;
  postMessage({ type: "input", prompt });
});
// input() pauses the program (like a terminal) in browsers with JSPI (Chrome, Edge).
// Elsewhere it reads the lines typed in the answers box before Run.
const SETUP = [
  "import builtins, sys",
  "from pyodide.ffi import can_run_sync, run_sync",
  "from js import askInput",
  "def _input(prompt=''):",
  "    sys.stdout.flush()",
  "    sys.stderr.flush()",
  "    return run_sync(askInput(str(prompt)))",
  "if can_run_sync(): builtins.input = _input",
  "can_run_sync()",
].join("\\n");
onmessage = async (e) => {
  if (e.data.type === "stdin") {
    if (answer) { const r = answer; answer = null; r(e.data.text); }
    return;
  }
  const { code, stdin, files } = e.data;
  try {
    if (!py) {
      postMessage({ type: "status", text: "Loading Python (about 10 MB, only the first time)…" });
      // The download can fail on a flaky connection: try up to three times.
      for (let attempt = 1; ; attempt++) {
        try { py = await loadPyodide({ indexURL: "${PYODIDE}" }); break; }
        catch (err) {
          if (attempt === 3) throw new Error("Couldn't download Python. Check your connection and press Run again.");
          postMessage({ type: "status", text: "Download hiccup, trying again…" });
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      postMessage({ type: "status", text: "Running…" });
    }
    if (!py._codeshareReady) {
      try { interactive = !!(await py.runPythonAsync(SETUP)); } catch { interactive = false; }
      py._codeshareReady = true;
      postMessage({ type: "mode", interactive });
    }
    py.setStdout(out("log"));
    py.setStderr(out("error"));
    const lines = stdin === "" ? [] : stdin.split("\\n");
    let i = 0;
    py.setStdin({ stdin: () => (i < lines.length ? lines[i++] : undefined) });
    // The room's other files, so open("data.txt") and "import helpers" work.
    for (const f of files) py.FS.writeFile("/home/pyodide/" + f.name, f.text);
    const names = files.filter((f) => f.name.endsWith(".py")).map((f) => f.name.slice(0, -3));
    py.globals.set("_room_modules", py.toPy(names));
    py.runPython("import sys\\nfor _m in _room_modules: sys.modules.pop(_m, None)");
    await py.loadPackagesFromImports(code);
    const globals = py.globals.get("dict")();
    globals.set("__name__", "__main__");
    // Not interactive: say where to type answers instead of a bare EOFError.
    try {
      await py.runPythonAsync(code, { globals });
    } catch (err) {
      if (!interactive && String(err && err.message).includes("EOFError")) {
        postMessage({ type: "out", stream: "info", text: "This browser can't pause for input(). Type your answers in the Answers box (one per line) and press Run again, or use Chrome or Edge." });
      }
      throw err;
    }
    globals.destroy();
  } catch (err) {
    // Hide Pyodide's own frames: keep the traceback from the student's code onwards.
    const msg = String(err && err.message || err);
    const start = msg.indexOf('File "<exec>"');
    postMessage({ type: "out", stream: "error", text: start > 0 ? "Traceback (most recent call last):\\n  " + msg.slice(start) : msg });
  }
  postMessage({ type: "done" });
};`;

const HOST = `<!doctype html><meta charset="utf-8"><script>
const make = (src) => new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
const send = (m) => parent.postMessage({ __run: 1, ...m }, "*");
let js = null, py = null;
const wire = (w) => {
  w.onmessage = (e) => send(e.data);
  w.onerror = (e) => { e.preventDefault(); send({ type: "out", stream: "error", text: e.message || "Worker error" }); send({ type: "done" }); };
  return w;
};
onmessage = (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m.type === "js") { js && js.terminate(); js = wire(make(${JSON.stringify(JS_WORKER)})); js.postMessage(m); }
  if (m.type === "py") { py = py || wire(make(${JSON.stringify(PY_WORKER)})); py.postMessage(m); }
  if (m.type === "stdin" && py) py.postMessage(m);
  if (m.type === "stop") { js && js.terminate(); py && py.terminate(); js = py = null; send({ type: "done", stopped: true }); }
};
send({ type: "ready" });
</script>`;

/** One hidden sandboxed iframe per editor, created on first run. */
export class Runner {
  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private onEvent: (e: RunEvent) => void;
  private listener = (e: MessageEvent) => {
    if (!this.frame || e.source !== this.frame.contentWindow || !e.data?.__run || e.data.type === "ready") return;
    this.onEvent(e.data as RunEvent);
  };

  constructor(onEvent: (e: RunEvent) => void) {
    this.onEvent = onEvent;
    addEventListener("message", this.listener);
  }

  private host() {
    if (this.ready) return this.ready;
    const frame = document.createElement("iframe");
    frame.sandbox.add("allow-scripts");
    frame.style.display = "none";
    frame.title = "Code runner";
    this.ready = new Promise<void>((resolve) => {
      const onReady = (e: MessageEvent) => {
        if (e.source === frame.contentWindow && e.data?.type === "ready") {
          removeEventListener("message", onReady);
          resolve();
        }
      };
      addEventListener("message", onReady);
    });
    frame.srcdoc = HOST;
    document.body.append(frame);
    this.frame = frame;
    return this.ready;
  }

  async run(kind: "js" | "py", code: string, stdin: string, files: RunFile[]) {
    await this.host();
    this.frame!.contentWindow!.postMessage({ type: kind, code, stdin, files }, "*");
  }

  /** Answer a paused input() call. */
  sendInput(text: string) {
    this.frame?.contentWindow?.postMessage({ type: "stdin", text }, "*");
  }

  async stop() {
    if (!this.frame) return;
    await this.host();
    this.frame.contentWindow!.postMessage({ type: "stop" }, "*");
  }

  destroy() {
    removeEventListener("message", this.listener);
    this.frame?.remove();
    this.frame = null;
    this.ready = null;
  }
}

export function runKind(name: string): "js" | "py" | "html" | "md" | null {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (["js", "mjs", "cjs"].includes(ext)) return "js";
  if (ext === "py") return "py";
  if (["html", "htm"].includes(ext)) return "html";
  if (["md", "markdown"].includes(ext)) return "md";
  return null;
}
