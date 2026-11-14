import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { formatBytes, parsePageRanges } from "./lib";
import { DropZone } from "./shared";
import { baseName, canvasBlob, downloadBlob } from "./util";

type Mode = "merge" | "extract" | "images";
const MODES: [Mode, string][] = [["merge", "Merge PDFs"], ["extract", "Extract pages"], ["images", "Images to PDF"]];
const A4 = { w: 595.28, h: 841.89 };

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: "application/pdf" });

// PDFs can only embed JPEG and PNG, so anything else (WebP, GIF…) is redrawn as PNG first.
async function embeddable(file: File) {
  if (file.type === "image/jpeg" || file.type === "image/png") return { bytes: await file.arrayBuffer(), jpeg: file.type === "image/jpeg" };
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return { bytes: await (await canvasBlob(canvas, "image/png")).arrayBuffer(), jpeg: false };
}

export default function PdfTool() {
  const [mode, setMode] = useState<Mode>("merge");
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState<number | null>(null);
  const [ranges, setRanges] = useState("");
  const [fitA4, setFitA4] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wantsPdf = mode !== "images";

  function switchMode(m: Mode) {
    setMode(m);
    setFiles([]);
    setPages(null);
    setError(null);
  }

  async function add(list: File[]) {
    setError(null);
    const ok = list.filter((f) => (wantsPdf ? f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") : f.type.startsWith("image/")));
    if (!ok.length) return setError(wantsPdf ? "Those aren't PDF files." : "Those aren't images.");
    if (mode === "extract") {
      try {
        const doc = await PDFDocument.load(await ok[0].arrayBuffer());
        setFiles([ok[0]]);
        setPages(doc.getPageCount());
        setRanges(`1-${doc.getPageCount()}`);
      } catch {
        setError("Couldn't open that PDF (it may be password-protected).");
      }
    } else {
      setFiles([...files, ...ok]);
    }
  }

  function shift(i: number, by: number) {
    const next = [...files];
    const [f] = next.splice(i, 1);
    next.splice(i + by, 0, f);
    setFiles(next);
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const out = await PDFDocument.create();
      if (mode === "merge") {
        for (const f of files) {
          const src = await PDFDocument.load(await f.arrayBuffer());
          (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
        }
        downloadBlob(pdfBlob(await out.save()), "merged.pdf");
      } else if (mode === "extract") {
        const src = await PDFDocument.load(await files[0].arrayBuffer());
        const wanted = parsePageRanges(ranges, src.getPageCount());
        (await out.copyPages(src, wanted)).forEach((p) => out.addPage(p));
        downloadBlob(pdfBlob(await out.save()), `${baseName(files[0].name)}-pages.pdf`);
      } else {
        for (const f of files) {
          const { bytes, jpeg } = await embeddable(f);
          const image = jpeg ? await out.embedJpg(bytes) : await out.embedPng(bytes);
          if (fitA4) {
            const landscape = image.width > image.height;
            const [pw, ph] = landscape ? [A4.h, A4.w] : [A4.w, A4.h];
            const margin = 24;
            const scale = Math.min((pw - margin * 2) / image.width, (ph - margin * 2) / image.height);
            const [w, h] = [image.width * scale, image.height * scale];
            out.addPage([pw, ph]).drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
          } else {
            out.addPage([image.width, image.height]).drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
          }
        }
        downloadBlob(pdfBlob(await out.save()), "images.pdf");
      }
    } catch (err) {
      setError(err instanceof Error && mode === "extract" ? err.message : "Couldn't build the PDF. One of the files may be damaged or password-protected.");
    }
    setBusy(false);
  }

  const ready = mode === "merge" ? files.length >= 2 : files.length >= 1;

  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="What to do">
        {MODES.map(([m, label]) => (
          <button key={m} className={mode === m ? "active" : ""} aria-pressed={mode === m} onClick={() => switchMode(m)}>{label}</button>
        ))}
      </div>
      <p className="side-note">Everything happens in your browser. Your files are not uploaded anywhere.</p>
      <DropZone
        key={mode}
        accept={wantsPdf ? "application/pdf,.pdf" : "image/*"}
        multiple={mode !== "extract"}
        title={mode === "merge" ? "Drop or choose PDFs to join" : mode === "extract" ? "Drop or choose one PDF" : "Drop, paste or choose images"}
        hint={mode === "merge" ? "They are joined in the order shown below" : mode === "extract" ? "Then say which pages to keep" : "Each image becomes one page"}
        disabled={busy}
        onFiles={add}
      />
      {error && <p className="json-status bad" role="status">✗ {error}</p>}

      {files.length > 0 && (
        <ol className="pdf-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="img-name">{f.name}</span>
              <span className="side-note">{formatBytes(f.size)}{mode === "extract" && pages ? ` · ${pages} pages` : ""}</span>
              {mode !== "extract" && (
                <>
                  <button className="btn small" disabled={i === 0} onClick={() => shift(i, -1)} aria-label={`Move ${f.name} up`}>↑</button>
                  <button className="btn small" disabled={i === files.length - 1} onClick={() => shift(i, 1)} aria-label={`Move ${f.name} down`}>↓</button>
                </>
              )}
              <button className="btn small" onClick={() => (setFiles(files.filter((_, j) => j !== i)), setPages(null))} aria-label={`Remove ${f.name}`}>✕</button>
            </li>
          ))}
        </ol>
      )}

      {mode === "extract" && pages && (
        <label className="field">
          Pages to keep
          <input className="code-input" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="1-3, 5, 8-" aria-label="Pages to keep" />
        </label>
      )}
      {mode === "images" && files.length > 0 && (
        <label><input type="checkbox" checked={fitA4} onChange={(e) => setFitA4(e.target.checked)} /> Fit each image on an A4 page (off: page is the image's size)</label>
      )}
      <div>
        <button className="btn primary big" disabled={!ready || busy} onClick={go}>
          {busy ? "Working…" : mode === "merge" ? "Merge and download" : mode === "extract" ? "Extract and download" : "Make PDF"}
        </button>
        {mode === "merge" && files.length === 1 && <span className="side-note"> Add at least one more PDF.</span>}
      </div>
    </div>
  );
}
