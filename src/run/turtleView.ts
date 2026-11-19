// Draws what Python's turtle (src/run/turtle.py) sends, animated at the speeds desktop turtle uses.
// Two stacked canvases: `layer` keeps the finished drawing; `top` shows the turtles and the line
// being drawn right now, and is repainted every frame.

type Pt = [number, number];
export type TurtleOp =
  | { o: "new"; id: number }
  | { o: "set"; id: number; x: number; y: number; h: number; vis: boolean; poly: Pt[]; pc: string; fc: string; sw: number; sl: number; ow: number }
  | { o: "go"; id: number; x: number; y: number; d: boolean; c: string; w: number; s: number }
  | { o: "turn"; id: number; h: number; s: number }
  | { o: "fillstart"; id: number }
  | { o: "fill"; id: number; pts: Pt[]; c: string }
  | { o: "dot"; id: number; x: number; y: number; r: number; c: string }
  | { o: "text"; id: number; x: number; y: number; t: string; a: string; f: [string, number, string]; c: string }
  | { o: "stamp"; id: number; sid: number }
  | { o: "clearstamp"; sid: number }
  | { o: "clear"; id: number }
  | { o: "clearscreen" }
  | { o: "bg"; c: string }
  | { o: "size"; w: number; h: number }
  | { o: "title"; t: string };

/** Keys and mouse on the drawing, sent to Python. Keys use Tk's names ("Up", "space", "a"). */
export type TurtleInput =
  | { type: "keydown" | "keyup"; key: string }
  | { type: "down" | "move" | "up"; x: number; y: number; btn: number };

const KEYSYMS: Record<string, string> = {
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", " ": "space", Enter: "Return",
  Escape: "Escape", Backspace: "BackSpace", Tab: "Tab", Delete: "Delete", Shift: "Shift_L", Control: "Control_L",
  Alt: "Alt_L", Meta: "Meta_L", CapsLock: "Caps_Lock", Home: "Home", End: "End", PageUp: "Prior", PageDown: "Next",
  Insert: "Insert",
};

/** A browser key as Tk names it, or null for keys turtle can't bind. */
export function keysym(key: string): string | null {
  if (KEYSYMS[key]) return KEYSYMS[key];
  if (/^F\d{1,2}$/.test(key) || key.length === 1) return key;
  return null;
}

type Look = { x: number; y: number; h: number; vis: boolean; poly: Pt[]; pc: string; fc: string; sw: number; sl: number; ow: number };
type Item =
  | { k: "line"; id: number; x1: number; y1: number; x2: number; y2: number; c: string; w: number }
  | { k: "fill"; id: number; pts: Pt[]; c: string }
  | { k: "dot"; id: number; x: number; y: number; r: number; c: string }
  | { k: "text"; id: number; x: number; y: number; t: string; a: string; f: [string, number, string]; c: string }
  | { k: "stamp"; id: number; sid: number; look: Look };

const STEP_MS = 10; // CPython's screen delay between animation steps
const INSTANT_PER_FRAME = 4000;

const newLook = (): Look => ({ x: 0, y: 0, h: 0, vis: true, poly: [], pc: "black", fc: "black", sw: 1, sl: 1, ow: 1 });

/** How long CPython takes to animate a move or a turn at a speed (1 slowest … 10 fast). */
export function moveMs(distance: number, speed: number) {
  return (1 + Math.floor(distance / (3 * 1.1 ** speed * speed))) * STEP_MS;
}
export function turnMs(degrees: number, speed: number) {
  return (1 + Math.floor(Math.abs(degrees) / (3 * speed))) * STEP_MS;
}

type Anim = { op: Extract<TurtleOp, { o: "go" | "turn" }>; from: Look; start: number; ms: number };

export class TurtleView {
  readonly stage = document.createElement("div");
  private layer = document.createElement("canvas");
  private top = document.createElement("canvas");
  private w = 800;
  private h = 600;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private bg = "white";
  private turtles = new Map<number, Look>();
  private items: Item[] = [];
  private fillAt = new Map<number, number>(); // turtle id -> where its fill goes in `items`
  private queue: TurtleOp[] = [];
  private anim: Anim | null = null;
  private lastEnd = 0;
  private frame = 0;
  private waiters: { pending: number; done: () => void }[] = [];
  /** Called when the turtle starts or stops drawing. */
  private onBusy: (busy: boolean) => void;
  private onInput: (ev: TurtleInput) => void;
  private busy = false;
  private listening = false;
  private wantFocus = false;
  private pointer: { btn: number; moved: { x: number; y: number } | null } | null = null;
  title = "";

  /** `onBusy` is told when the turtle starts or stops drawing; `onInput` gets keys and clicks. */
  constructor(onBusy: (busy: boolean) => void = () => {}, onInput: (ev: TurtleInput) => void = () => {}) {
    this.onBusy = onBusy;
    this.onInput = onInput;
    this.stage.tabIndex = 0;
    this.stage.addEventListener("keydown", (e) => this.key(e, "keydown"));
    this.stage.addEventListener("keyup", (e) => this.key(e, "keyup"));
    this.top.addEventListener("pointerdown", (e) => this.mouse(e, "down"));
    this.top.addEventListener("pointermove", (e) => this.mouse(e, "move"));
    this.top.addEventListener("pointerup", (e) => this.mouse(e, "up"));
    this.top.addEventListener("contextmenu", (e) => this.listening && e.preventDefault());
    this.stage.className = "turtle-stage";
    this.layer.className = "turtle-layer";
    this.top.className = "turtle-layer";
    this.layer.setAttribute("aria-hidden", "true");
    this.top.setAttribute("role", "img");
    this.top.setAttribute("aria-label", "Turtle drawing");
    this.stage.append(this.layer, this.top);
    this.resize(800, 600);
  }

  /** Whether the program has key, click or timer handlers. */
  setListening(on: boolean) {
    this.listening = on;
    this.stage.classList.toggle("listening", on);
  }

  /** listen(): give the drawing the keyboard. */
  focus() {
    // The stage may not be on the page yet: TurtleStage calls shown() once it is.
    this.wantFocus = true;
    if (this.stage.isConnected) this.stage.focus({ preventScroll: true });
  }

  /** The stage was just put on the page. */
  shown() {
    if (this.wantFocus) this.stage.focus({ preventScroll: true });
  }

  private key(e: KeyboardEvent, type: "keydown" | "keyup") {
    if (!this.listening || e.metaKey || e.ctrlKey) return;
    const key = keysym(e.key);
    if (!key) return;
    e.preventDefault(); // arrows and space would scroll the page
    this.onInput({ type, key });
  }

  /** Turtle coordinates of a pointer event (the canvas is letterboxed with object-fit: contain). */
  private where(e: PointerEvent) {
    const r = this.top.getBoundingClientRect();
    const scale = Math.min(r.width / this.w, r.height / this.h);
    const left = r.left + (r.width - this.w * scale) / 2;
    const top = r.top + (r.height - this.h * scale) / 2;
    return {
      x: Math.round(((e.clientX - left) / scale - this.w / 2) * 100) / 100,
      y: Math.round((this.h / 2 - (e.clientY - top) / scale) * 100) / 100,
    };
  }

  private mouse(e: PointerEvent, type: "down" | "move" | "up") {
    if (!this.listening) return;
    const { x, y } = this.where(e);
    if (type === "down") {
      const btn = e.button === 1 ? 2 : e.button === 2 ? 3 : 1;
      this.pointer = { btn, moved: null };
      this.top.setPointerCapture(e.pointerId);
      this.focus();
      this.onInput({ type, x, y, btn });
    } else if (this.pointer) {
      const p = this.pointer;
      if (type === "up") {
        this.pointer = null;
        this.onInput({ type, x, y, btn: p.btn });
      } else {
        // At most one drag event per frame.
        if (!p.moved) {
          requestAnimationFrame(() => {
            if (this.pointer === p && p.moved) this.onInput({ type: "move", ...p.moved, btn: p.btn });
            p.moved = null;
          });
        }
        p.moved = { x, y };
      }
    }
  }

  /** Start over for a new run. */
  reset() {
    this.queue = [];
    this.anim = null;
    this.turtles.clear();
    this.items = [];
    this.fillAt.clear();
    this.bg = "white";
    this.title = "";
    this.pointer = null;
    this.wantFocus = false;
    this.setListening(false);
    this.resize(800, 600);
    this.release(true);
    this.setBusy(false);
  }

  /** Stop drawing: what's drawn stays, the rest is dropped. */
  stop() {
    this.setListening(false);
    if (this.anim) this.finish(this.anim);
    this.anim = null;
    this.queue = [];
    this.paintTop();
    this.release(true);
    this.setBusy(false);
  }

  push(ops: TurtleOp[]) {
    this.queue.push(...ops);
    this.setBusy(true);
    this.schedule();
  }

  /** Resolves once at most `pending` steps are left to draw. */
  whenPending(pending: number): Promise<void> {
    return new Promise((done) => {
      this.waiters.push({ pending, done });
      this.release(false);
    });
  }

  private release(all: boolean) {
    const left = this.queue.length + (this.anim ? 1 : 0);
    this.waiters = this.waiters.filter((w) => {
      if (all || left <= w.pending) {
        w.done();
        return false;
      }
      return true;
    });
  }

  private setBusy(busy: boolean) {
    if (busy !== this.busy) {
      this.busy = busy;
      this.onBusy(busy);
    }
  }

  private schedule() {
    if (!this.frame) this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number) {
    this.frame = 0;
    let instant = 0;
    while (instant < INSTANT_PER_FRAME) {
      if (!this.anim) {
        const op = this.queue[0];
        if (!op) break;
        const ms = this.duration(op);
        if (ms === 0) {
          this.queue.shift();
          this.apply(op);
          instant++;
          continue;
        }
        const look = this.look((op as { id: number }).id);
        // Chain animations back to back so the speed stays right even when frames are late.
        const start = now - this.lastEnd < 100 ? this.lastEnd : now;
        this.anim = { op: op as Anim["op"], from: { ...look }, start, ms };
      }
      const a = this.anim;
      if (now - a.start < a.ms) break;
      this.queue.shift();
      this.finish(a);
      this.lastEnd = a.start + a.ms;
      this.anim = null;
    }
    this.paintTop(now);
    this.release(false);
    if (this.queue.length || this.anim) this.schedule();
    else this.setBusy(false);
  }

  private duration(op: TurtleOp): number {
    if (op.o === "go" && op.s > 0) {
      const t = this.look(op.id);
      const dist = Math.hypot(op.x - t.x, op.y - t.y);
      return dist === 0 ? 0 : moveMs(dist, op.s);
    }
    if (op.o === "turn" && op.s > 0) {
      const t = this.look(op.id);
      const diff = ((op.h - t.h + 540) % 360) - 180;
      return diff === 0 ? 0 : turnMs(diff, op.s);
    }
    return 0;
  }

  private look(id: number) {
    let t = this.turtles.get(id);
    if (!t) {
      t = newLook();
      this.turtles.set(id, t);
    }
    return t;
  }

  private finish(a: Anim) {
    this.apply(a.op);
  }

  private apply(op: TurtleOp) {
    switch (op.o) {
      case "new":
        this.turtles.set(op.id, newLook());
        break;
      case "set": {
        const { o: _o, id, ...look } = op;
        void _o;
        Object.assign(this.look(id), look);
        break;
      }
      case "go": {
        const t = this.look(op.id);
        if (op.d) this.add({ k: "line", id: op.id, x1: t.x, y1: t.y, x2: op.x, y2: op.y, c: op.c, w: op.w });
        t.x = op.x;
        t.y = op.y;
        break;
      }
      case "turn":
        this.look(op.id).h = op.h;
        break;
      case "fillstart":
        this.fillAt.set(op.id, this.items.length);
        break;
      case "fill": {
        // The fill goes underneath the outline drawn since begin_fill, as on the desktop.
        const at = Math.min(this.fillAt.get(op.id) ?? this.items.length, this.items.length);
        this.fillAt.delete(op.id);
        this.items.splice(at, 0, { k: "fill", id: op.id, pts: op.pts, c: op.c });
        for (const [id, i] of this.fillAt) if (i >= at) this.fillAt.set(id, i + 1);
        this.redraw();
        break;
      }
      case "dot":
        this.add({ k: "dot", id: op.id, x: op.x, y: op.y, r: op.r, c: op.c });
        break;
      case "text":
        this.add({ k: "text", id: op.id, x: op.x, y: op.y, t: op.t, a: op.a, f: op.f, c: op.c });
        break;
      case "stamp":
        this.add({ k: "stamp", id: op.id, sid: op.sid, look: { ...this.look(op.id) } });
        break;
      case "clearstamp":
        this.items = this.items.filter((i) => !(i.k === "stamp" && i.sid === op.sid));
        this.redraw();
        break;
      case "clear":
        this.items = this.items.filter((i) => i.id !== op.id);
        this.fillAt.delete(op.id);
        this.redraw();
        break;
      case "clearscreen":
        this.items = [];
        this.turtles.clear();
        this.fillAt.clear();
        this.bg = "white";
        this.redraw();
        break;
      case "bg":
        this.bg = op.c;
        this.redraw();
        break;
      case "size":
        this.resize(op.w, op.h);
        break;
      case "title":
        this.title = op.t;
        break;
    }
  }

  private add(item: Item) {
    this.items.push(item);
    const ctx = this.ctx(this.layer);
    this.draw(ctx, item);
  }

  private resize(w: number, h: number) {
    this.w = Math.max(50, Math.min(4000, w));
    this.h = Math.max(50, Math.min(4000, h));
    for (const c of [this.layer, this.top]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.stage.style.setProperty("--turtle-ratio", `${this.w} / ${this.h}`);
    this.redraw();
    this.paintTop();
  }

  /** A context whose coordinates are turtle's: origin in the middle, y up. */
  private ctx(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(this.dpr, 0, 0, -this.dpr, (this.w / 2) * this.dpr, (this.h / 2) * this.dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  private redraw() {
    const ctx = this.layer.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, this.layer.width, this.layer.height);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, this.layer.width, this.layer.height);
    const t = this.ctx(this.layer);
    for (const item of this.items) this.draw(t, item);
  }

  private draw(ctx: CanvasRenderingContext2D, item: Item) {
    switch (item.k) {
      case "line":
        ctx.strokeStyle = item.c;
        ctx.lineWidth = Math.max(1, item.w);
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(item.x2, item.y2);
        ctx.stroke();
        break;
      case "fill":
        ctx.fillStyle = item.c;
        ctx.beginPath();
        item.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill("evenodd");
        break;
      case "dot":
        ctx.fillStyle = item.c;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "text": {
        const [family, size, style] = item.f;
        ctx.save();
        ctx.scale(1, -1); // text the right way up
        const weight = /bold/.test(style) ? "bold " : "";
        const italic = /italic/.test(style) ? "italic " : "";
        ctx.font = `${italic}${weight}${Math.abs(size) * 1.33}px ${JSON.stringify(family)}, sans-serif`;
        ctx.fillStyle = item.c;
        ctx.textAlign = item.a === "center" ? "center" : item.a === "right" ? "right" : "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(item.t, item.x, -item.y);
        if (/underline/.test(style)) {
          const m = ctx.measureText(item.t);
          const x0 = item.a === "center" ? item.x - m.width / 2 : item.a === "right" ? item.x - m.width : item.x;
          ctx.fillRect(x0, -item.y - 1, m.width, 1);
        }
        ctx.restore();
        break;
      }
      case "stamp":
        this.drawTurtle(ctx, item.look);
        break;
    }
  }

  private drawTurtle(ctx: CanvasRenderingContext2D, t: Look) {
    if (t.poly.length < 2) return;
    // Shapes point along their +y axis; turn that to the heading.
    const a = ((t.h - 90) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.beginPath();
    t.poly.forEach(([px, py], i) => {
      const sx = px * t.sw;
      const sy = py * t.sl;
      const x = t.x + sx * cos - sy * sin;
      const y = t.y + sx * sin + sy * cos;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = t.fc;
    ctx.fill();
    if (t.ow > 0) {
      ctx.strokeStyle = t.pc;
      ctx.lineWidth = t.ow;
      ctx.stroke();
    }
  }

  private paintTop(now = performance.now()) {
    const ctx = this.top.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.top.width, this.top.height);
    const t = this.ctx(this.top);
    const a = this.anim;
    let moving: Look | null = null;
    if (a) {
      const f = Math.min(1, Math.max(0, (now - a.start) / a.ms));
      const from = a.from;
      moving = { ...this.look(a.op.id) };
      if (a.op.o === "go") {
        moving.x = from.x + (a.op.x - from.x) * f;
        moving.y = from.y + (a.op.y - from.y) * f;
        if (a.op.d) {
          t.strokeStyle = a.op.c;
          t.lineWidth = Math.max(1, a.op.w);
          t.beginPath();
          t.moveTo(from.x, from.y);
          t.lineTo(moving.x, moving.y);
          t.stroke();
        }
      } else {
        const diff = ((a.op.h - from.h + 540) % 360) - 180;
        moving.h = from.h + diff * f;
      }
    }
    for (const [id, look] of this.turtles) {
      const shown = a && a.op.id === id ? moving! : look;
      if (shown.vis) this.drawTurtle(t, shown);
    }
  }
}
