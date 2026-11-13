import { useEffect, useRef, useState } from "react";
import type { Device, FromWorker, ToWorker } from "./bg.worker";

const MAX_SIDE = 4096; // bigger photos are scaled down first to keep memory sane
const MAX_FILE = 25_000_000;

// Set after WebGPU fails once on this device, so later images go straight to the CPU.
let cpuOnly = false;

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; percent: number | null; device: Device | null; fellBack?: boolean }
  | { kind: "working"; device: Device | null }
  | { kind: "done" }
  | { kind: "error"; message: string };

async function decode(file: File) {
  const probe = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(probe.width, probe.height));
  const width = Math.round(probe.width * scale);
  const height = Math.round(probe.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(probe, 0, 0, width, height);
  probe.close();
  return { canvas, ctx, width, height };
}

export default function BgTool() {
  const worker = useRef<Worker | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [name, setName] = useState("image");
  const [dragging, setDragging] = useState(false);
  const busy = phase.kind === "loading" || phase.kind === "working";

  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => () => void (before && URL.revokeObjectURL(before)), [before]);
  useEffect(() => () => void (after && URL.revokeObjectURL(after)), [after]);

  function getWorker() {
    worker.current ??= new Worker(new URL("./bg.worker.ts", import.meta.url), { type: "module" });
    return worker.current;
  }

  function freshWorker() {
    worker.current?.terminate();
    worker.current = null;
    return getWorker();
  }

  async function run(file: File) {
    if (busy) return;
    if (!file.type.startsWith("image/")) return setPhase({ kind: "error", message: "That isn't an image." });
    if (file.size > MAX_FILE) return setPhase({ kind: "error", message: "Image is over 25 MB." });

    setName(file.name.replace(/\.[^.]+$/, "") || "image");
    setBefore(URL.createObjectURL(file));
    setAfter(null);
    setPhase({ kind: "loading", percent: null, device: null });

    let decoded;
    try {
      decoded = await decode(file);
    } catch {
      return setPhase({ kind: "error", message: "Couldn't read that image." });
    }
    const { canvas, ctx, width, height } = decoded;
    const pixels = ctx.getImageData(0, 0, width, height);

    // Keep a copy: the buffer we send is transferred, and a CPU retry needs it again.
    const send = (w: Worker) => {
      const copy = pixels.data.slice().buffer;
      w.onmessage = onMessage;
      w.postMessage({ type: "run", pixels: copy, width, height, cpuOnly } satisfies ToWorker, [copy]);
    };
    const onMessage = async (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        const percent = msg.total ? Math.round((msg.loaded / msg.total) * 100) : null;
        setPhase((p) => ({ kind: "loading", percent, device: msg.device, fellBack: p.kind === "loading" && p.fellBack }));
      } else if (msg.type === "gpu-failed") {
        cpuOnly = true;
        setPhase({ kind: "loading", percent: null, device: "wasm", fellBack: true });
        send(freshWorker());
      } else if (msg.type === "ready") {
        setPhase({ kind: "working", device: msg.device });
      } else if (msg.type === "error") {
        setPhase({ kind: "error", message: `Background removal failed: ${msg.message}` });
      } else if (msg.type === "mask") {
        const alpha = new Uint8Array(msg.mask);
        for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i];
        ctx.putImageData(pixels, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        setAfter(URL.createObjectURL(blob));
        setPhase({ kind: "done" });
      }
    };
    send(getWorker());
  }

  // Paste an image anywhere on the page.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        runRef.current(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  function status() {
    switch (phase.kind) {
      case "loading": {
        const size = phase.device === "wasm" ? "~190 MB" : "~100 MB";
        const why = phase.fellBack && <p className="side-note">Your GPU can't run this model, switching to the CPU version…</p>;
        if (phase.percent === null) return why || <p className="side-note">Starting…</p>;
        return (
          <div className="bg-progress">
            {why}
            <p className="side-note">Downloading the model ({size}, only the first time): {phase.percent}%</p>
            <progress max={100} value={phase.percent} />
          </div>
        );
      }
      case "working":
        return <p className="side-note">Removing background{phase.device === "wasm" ? " (no GPU, this can take a while)" : ""}…</p>;
      case "error":
        return <p className="side-note error">{phase.message}</p>;
      default:
        return null;
    }
  }

  return (
    <div className="bg">
      <p className="side-note">
        Runs entirely in your browser. Your image never leaves your device. The first use downloads a free AI model
        (BiRefNet, MIT licence) which is then cached.
      </p>

      <button
        className={`bg-drop${dragging ? " over" : ""}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) run(file);
        }}
      >
        <strong>Drop, paste or choose an image</strong>
        <span>PNG, JPEG, WebP, up to 25 MB</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) run(file);
          e.target.value = "";
        }}
      />

      {status()}

      {before && (
        <div className="bg-compare">
          <figure>
            <figcaption>Before</figcaption>
            <img src={before} alt="Original" />
          </figure>
          <figure>
            <figcaption>After</figcaption>
            {after ? <img className="checker" src={after} alt="Background removed" /> : <div className="bg-wait checker" />}
          </figure>
        </div>
      )}

      {after && (
        <a className="btn primary bg-download" href={after} download={`${name}-no-bg.png`}>
          Download PNG
        </a>
      )}
    </div>
  );
}
