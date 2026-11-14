import { useState } from "react";
import { contrast, fromHsl, parseHex, shades, toHex, toHsl } from "./lib";
import { CopyButton } from "./shared";

type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> };
const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

function HexInput({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setDraft(value);
  }
  return (
    <span className="hex">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} />
      <input
        className="code-input"
        value={draft}
        aria-label={`${label} hex`}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          const rgb = parseHex(e.target.value);
          if (rgb) onChange(toHex(rgb));
        }}
      />
    </span>
  );
}

const grade = (ratio: number, large: boolean) => (ratio >= (large ? 4.5 : 7) ? "AAA" : ratio >= (large ? 3 : 4.5) ? "AA" : "Fail");

export default function ColourTool() {
  const [hex, setHex] = useState("#7c5cff");
  const [fg, setFg] = useState("#1c1e24");
  const [bg, setBg] = useState("#ffffff");
  const rgb = parseHex(hex)!;
  const hsl = toHsl(rgb);
  const values: [string, string][] = [
    ["HEX", hex],
    ["RGB", `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`],
    ["HSL", `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`],
  ];
  const harmony: [string, number[]][] = [["Complementary", [180]], ["Analogous", [-30, 30]], ["Triadic", [120, 240]]];
  const ratio = contrast(parseHex(fg)!, parseHex(bg)!);

  async function pick() {
    try {
      setHex((await new eyeDropper!().open()).sRGBHex);
    } catch {
      // cancelled
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Pick a colour</h2>
        <div className="colour-top">
          <div className="swatch-big" style={{ background: hex }} />
          <div className="stack">
            <div className="json-bar">
              <HexInput value={hex} onChange={setHex} label="Colour" />
              {eyeDropper && <button className="btn" onClick={pick}>Pick from screen</button>}
            </div>
            <table className="grid-table">
              <tbody>
                {values.map(([k, v]) => (
                  <tr key={k}><th>{k}</th><td><code>{v}</code></td><td><CopyButton text={v} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Palette</h2>
        <p className="side-note">Click a colour to copy it.</p>
        <Row label="Shades" colours={shades(rgb)} />
        {harmony.map(([label, turns]) => (
          <Row key={label} label={label} colours={[hex, ...turns.map((t) => toHex(fromHsl(hsl.h + t, hsl.s, hsl.l)))]} />
        ))}
      </section>

      <section className="card">
        <h2>Contrast checker</h2>
        <div className="json-bar">
          <label>Text <HexInput value={fg} onChange={setFg} label="Text" /></label>
          <label>Background <HexInput value={bg} onChange={setBg} label="Background" /></label>
          <button className="btn small" onClick={() => (setFg(bg), setBg(fg))}>⇄ Swap</button>
        </div>
        <div className="contrast-demo" style={{ color: fg, background: bg }}>
          <strong>Large heading text</strong>
          <span>Normal body text looks like this.</span>
        </div>
        <div className="json-bar" role="status">
          <span className="ratio">{ratio.toFixed(2)} : 1</span>
          <span className={`badge ${grade(ratio, false)}`}>Normal text: {grade(ratio, false)}</span>
          <span className={`badge ${grade(ratio, true)}`}>Large text: {grade(ratio, true)}</span>
        </div>
        <p className="side-note">WCAG asks for at least 4.5 : 1 for normal text and 3 : 1 for large text (AA).</p>
      </section>
    </div>
  );
}

function Row({ label, colours }: { label: string; colours: string[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="palette-row">
      <span className="palette-label">{label}</span>
      <div className="palette">
        {colours.map((c, i) => (
          <button
            key={i}
            style={{ background: c, color: contrast(parseHex(c)!, { r: 255, g: 255, b: 255 }) > 3 ? "#fff" : "#111" }}
            title={`Copy ${c}`}
            onClick={async () => {
              await navigator.clipboard.writeText(c);
              setCopied(c);
              setTimeout(() => setCopied(null), 1000);
            }}
          >
            {copied === c ? "✓" : c}
          </button>
        ))}
      </div>
    </div>
  );
}
