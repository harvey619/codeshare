import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { DropZone } from "./shared";
import { baseName, canvasBlob, downloadBlob } from "./util";

type Box = { x: number; y: number; w: number; h: number }; // in image pixels
const RATIOS: [string, number | null][] = [["Free", null], ["Square", 1], ["4:3", 4 / 3], ["16:9", 16 / 9], ["9:16", 9 / 16], ["3:2", 3 / 2]];
const FORMATS = [["PNG", "image/png", "png"], ["JPEG", "image/jpeg", "jpg"], ["WebP", "image/webp", "webp"]] as const;
const MIN = 16;

/** The biggest centred box of a given shape that fits the image. */
function fit(iw: number, ih: number, ratio: number | null): Box {
  if (!ratio) return { x: 0, y: 0, w: iw, h: ih };
  const w = Math.min(iw, ih * ratio);
  const h = w / ratio;
  return { x: (iw - w) / 2, y: (ih - h) / 2, w, h };
}

export default function CropTool() {
  const [img, setImg] = useState<{ url: string; w: number; h: number; name: string; bitmap: ImageBitmap } | null>(null);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [ratio, setRatio] = useState<number | null>(null);
  const [outW, setOutW] = useState(0);
  const [format, setFormat] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; start: Box; scale: number } | null>(null);

  useEffect(() => () => void (img && URL.revokeObjectURL(img.url)), [img]);

  async function open(files: File[]) {
    const file = files.find((f) => f.type.startsWith("image/"));
    if (!file) return setError("That isn't an image.");
    try {
      const bitmap = await createImageBitmap(file);
      setError(null);
      setImg({ url: URL.createObjectURL(file), w: bitmap.width, h: bitmap.height, name: file.name || "image", bitmap });
      const b = fit(bitmap.width, bitmap.height, ratio);
      setBox(b);
      setOutW(Math.round(b.w));
    } catch {
      setError("Couldn't read that image.");
    }
  }

  function applyBox(b: Box) {
    setBox(b);
    setOutW(Math.round(b.w));
  }

  function start(e: RPointerEvent, mode: "move" | "size") {
    if (!img || !stage.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: box, scale: img.w / stage.current.clientWidth };
  }
  function move(e: RPointerEvent) {
    const d = drag.current;
    if (!d || !img) return;
    const dx = (e.clientX - d.sx) * d.scale;
    const dy = (e.clientY - d.sy) * d.scale;
    const s = d.start;
    if (d.mode === "move") {
      applyBox({ ...s, x: Math.max(0, Math.min(img.w - s.w, s.x + dx)), y: Math.max(0, Math.min(img.h - s.h, s.y + dy)) });
    } else {
      let w = Math.max(MIN, Math.min(img.w - s.x, s.w + dx));
      let h = ratio ? w / ratio : Math.max(MIN, Math.min(img.h - s.y, s.h + dy));
      if (ratio && s.y + h > img.h) {
        h = img.h - s.y;
        w = h * ratio;
      }
      applyBox({ ...s, w, h });
    }
  }

  async function save() {
    if (!img) return;
    const [, type, ext] = FORMATS[format];
    const w = Math.max(1, Math.min(8000, Math.round(outW || box.w)));
    const h = Math.max(1, Math.round((w * box.h) / box.w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    if (type === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.bitmap, box.x, box.y, box.w, box.h, 0, 0, w, h);
    downloadBlob(await canvasBlob(canvas, type, 0.9), `${baseName(img.name)}-${w}x${h}.${ext}`);
  }

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const outH = box.w ? Math.max(1, Math.round(((outW || box.w) * box.h) / box.w)) : 0;

  return (
    <div className="stack">
      <DropZone accept="image/*" title={img ? "Choose a different image" : "Drop, paste or choose an image"} hint="Then drag the box to crop" onFiles={open} />
      {error && <p className="side-note error">{error}</p>}
      {img && (
        <>
          <div className="json-bar">
            <div className="seg" role="group" aria-label="Shape">
              {RATIOS.map(([label, r]) => (
                <button key={label} className={ratio === r ? "active" : ""} aria-pressed={ratio === r} onClick={() => (setRatio(r), applyBox(fit(img.w, img.h, r)))}>{label}</button>
              ))}
            </div>
            <span className="side-note">Original {img.w}×{img.h}</span>
          </div>
          <div className="crop-stage" ref={stage} style={{ aspectRatio: `${img.w} / ${img.h}` }}>
            <img src={img.url} alt="Image being cropped" draggable={false} />
            <div
              className="crop-box"
              style={{ left: pct(box.x, img.w), top: pct(box.y, img.h), width: pct(box.w, img.w), height: pct(box.h, img.h) }}
              onPointerDown={(e) => start(e, "move")}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
            >
              <span className="crop-handle" onPointerDown={(e) => start(e, "size")} onPointerMove={move} onPointerUp={() => (drag.current = null)} />
            </div>
          </div>
          <div className="json-bar">
            <label>
              Width <input className="num" type="number" min={1} max={8000} value={outW} onChange={(e) => setOutW(Number(e.target.value))} aria-label="Output width" /> px
            </label>
            <span className="side-note">× {outH} px</span>
            {[25, 50, 100].map((p) => (
              <button key={p} className="btn small" onClick={() => setOutW(Math.max(1, Math.round((box.w * p) / 100)))}>{p}%</button>
            ))}
            <div className="seg" role="group" aria-label="Format">
              {FORMATS.map(([label], i) => (
                <button key={label} className={format === i ? "active" : ""} aria-pressed={format === i} onClick={() => setFormat(i)}>{label}</button>
              ))}
            </div>
            <button className="btn primary" onClick={save}>Download</button>
          </div>
        </>
      )}
    </div>
  );
}
