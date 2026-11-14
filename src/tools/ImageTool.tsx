import { useState } from "react";
import { formatBytes } from "./lib";
import { DropZone } from "./shared";
import { baseName, canvasBlob, downloadBlob } from "./util";

const FORMATS = [
  { type: "image/webp", ext: "webp", label: "WebP" },
  { type: "image/jpeg", ext: "jpg", label: "JPEG" },
  { type: "image/png", ext: "png", label: "PNG" },
] as const;
type Item = { name: string; before: number; blob: Blob | null; url: string | null; w: number; h: number; error: string | null };

async function convert(file: File, type: string, quality: number, maxSide: number) {
  const bitmap = await createImageBitmap(file);
  const scale = maxSide > 0 ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (type === "image/jpeg") {
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { blob: await canvasBlob(canvas, type, quality), w, h };
}

export default function ImageTool() {
  const [format, setFormat] = useState(0);
  const [quality, setQuality] = useState(80);
  const [maxSide, setMaxSide] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fmt = FORMATS[format];

  async function run(files: File[], f = fmt, q = quality, m = maxSide) {
    const images = files.filter((x) => x.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    setSources(images);
    items.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    const out: Item[] = [];
    for (const file of images) {
      const name = `${baseName(file.name || "image")}.${f.ext}`;
      try {
        const { blob, w, h } = await convert(file, f.type, q / 100, m);
        out.push({ name, before: file.size, blob, url: URL.createObjectURL(blob), w, h, error: null });
      } catch {
        out.push({ name: file.name, before: file.size, blob: null, url: null, w: 0, h: 0, error: "Couldn't read this image" });
      }
      setItems([...out]);
    }
    setBusy(false);
  }
  const redo = (f = fmt, q = quality, m = maxSide) => sources.length && run(sources, f, q, m);

  const done = items.filter((i) => i.blob);
  const saved = done.reduce((n, i) => n + i.before - i.blob!.size, 0);

  return (
    <div className="stack">
      <div className="json-bar">
        <div className="seg" role="group" aria-label="Output format">
          {FORMATS.map((f, i) => (
            <button key={f.ext} className={format === i ? "active" : ""} aria-pressed={format === i} onClick={() => (setFormat(i), redo(f))}>{f.label}</button>
          ))}
        </div>
        {fmt.ext !== "png" && (
          <label>Quality <input type="range" min={10} max={100} step={5} value={quality} onChange={(e) => setQuality(Number(e.target.value))} onPointerUp={() => redo()} onKeyUp={() => redo()} /> <strong>{quality}</strong></label>
        )}
        <label>
          Max size{" "}
          <select value={maxSide} onChange={(e) => (setMaxSide(Number(e.target.value)), redo(fmt, quality, Number(e.target.value)))}>
            <option value={0}>Original</option>
            <option value={3840}>3840 px</option>
            <option value={1920}>1920 px</option>
            <option value={1280}>1280 px</option>
            <option value={800}>800 px</option>
          </select>
        </label>
      </div>
      <DropZone accept="image/*" multiple title="Drop, paste or choose images" hint="PNG, JPEG, WebP, GIF, AVIF… as many as you like" disabled={busy} onFiles={(f) => run(f)} />
      {fmt.ext === "png" && <p className="side-note">PNG keeps every pixel, so files can get bigger. Pick WebP or JPEG to shrink photos.</p>}

      {items.length > 0 && (
        <>
          <div className="json-bar">
            <strong>{done.length} {done.length === 1 ? "image" : "images"}</strong>
            {done.length > 0 && <span className={saved >= 0 ? "plus" : "minus"}>{saved >= 0 ? `saved ${formatBytes(saved)}` : `${formatBytes(-saved)} bigger`}</span>}
            {done.length > 1 && <button className="btn primary" onClick={() => done.forEach((i, n) => setTimeout(() => downloadBlob(i.blob!, i.name), n * 150))}>Download all</button>}
          </div>
          <ul className="img-list">
            {items.map((i, n) => (
              <li key={n}>
                {i.url ? <img src={i.url} alt="" /> : <span className="img-missing" />}
                <span className="img-name">{i.name}</span>
                {i.blob ? (
                  <>
                    <span className="side-note">{i.w}×{i.h} · {formatBytes(i.before)} → <strong>{formatBytes(i.blob.size)}</strong> ({Math.round((i.blob.size / i.before - 1) * 100)}%)</span>
                    <button className="btn small" onClick={() => downloadBlob(i.blob!, i.name)}>Download</button>
                  </>
                ) : (
                  <span className="side-note error">{i.error}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
