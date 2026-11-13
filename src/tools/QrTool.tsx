import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Level = "L" | "M" | "Q" | "H";

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

export default function QrTool() {
  const [text, setText] = useState(location.origin);
  const [level, setLevel] = useState<Level>("M");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    if (!text) return;
    QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: level })
      .then((out) => current && (setSvg(out), setError(null)))
      .catch(() => current && (setSvg(null), setError("Too much text for one QR code.")));
    return () => {
      current = false;
    };
  }, [text, level]);

  // An empty box shows nothing, even if an older code is still in state.
  const shown = text ? svg : null;
  const svgUrl = shown ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(shown)}` : null;

  async function downloadPng() {
    const url = await QRCode.toDataURL(text, { width: 1024, margin: 2, errorCorrectionLevel: level });
    download(url, "qr-code.png");
  }

  return (
    <div className="qr">
      <div className="qr-form">
        <label htmlFor="qr-text">Link or text</label>
        <textarea id="qr-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus />
        <label htmlFor="qr-level">Error correction</label>
        <select id="qr-level" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
          <option value="L">Low (smallest)</option>
          <option value="M">Medium</option>
          <option value="Q">High</option>
          <option value="H">Highest (survives a logo or damage)</option>
        </select>
        {text && error && <p className="side-note error">{error}</p>}
        <div className="qr-actions">
          <button className="btn primary" disabled={!shown} onClick={downloadPng}>Download PNG</button>
          <button className="btn" disabled={!svgUrl} onClick={() => svgUrl && download(svgUrl, "qr-code.svg")}>
            Download SVG
          </button>
        </div>
      </div>
      <div className="qr-preview">
        {svgUrl ? <img src={svgUrl} alt="QR code preview" /> : <p className="side-note">Type something to make a code</p>}
      </div>
    </div>
  );
}
