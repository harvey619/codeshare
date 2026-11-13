import { useRef, useState } from "react";
import { checkJson, formatJson } from "./json";

const SAMPLE = '{"name":"harveys","tools":["qr","bg","json"],"limits":{"rooms":50,"ttlDays":14}}';
type Indent = "2" | "4" | "tab";

function describe(value: unknown) {
  if (Array.isArray(value)) return `array, ${value.length} items`;
  if (value && typeof value === "object") return `object, ${Object.keys(value).length} keys`;
  return typeof value === "string" ? "string" : value === null ? "null" : typeof value;
}

export default function JsonTool() {
  const [text, setText] = useState(SAMPLE);
  const [indent, setIndent] = useState<Indent>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const result = text.trim() ? checkJson(text) : null;

  function rewrite(minify: boolean) {
    if (!result?.ok) return;
    setText(formatJson(result.value, minify ? 0 : indent === "tab" ? "\t" : Number(indent), sortKeys));
  }

  function goToError() {
    if (!result || result.ok || result.line === null || !area.current) return;
    const lines = text.split("\n");
    const offset = lines.slice(0, result.line - 1).reduce((n, l) => n + l.length + 1, 0) + (result.column ?? 1) - 1;
    area.current.focus();
    area.current.setSelectionRange(offset, offset + 1);
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="json">
      <div className="json-bar">
        <button className="btn primary" onClick={() => rewrite(false)} disabled={!result?.ok}>Format</button>
        <button className="btn" onClick={() => rewrite(true)} disabled={!result?.ok}>Minify</button>
        <label>
          Indent{" "}
          <select value={indent} onChange={(e) => setIndent(e.target.value as Indent)}>
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="tab">Tab</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} /> Sort keys
        </label>
        <button className="btn" onClick={copy} disabled={!text}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>

      {result && (
        <p className={`json-status ${result.ok ? "ok" : "bad"}`} role="status">
          {result.ok ? (
            <>✓ Valid JSON ({describe(result.value)})</>
          ) : (
            <>
              ✗ {result.line !== null && `Line ${result.line}, column ${result.column}: `}
              {result.message}
              {result.line !== null && (
                <button className="link" onClick={goToError}>Show me</button>
              )}
            </>
          )}
        </p>
      )}

      <textarea
        ref={area}
        className="code-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label="JSON"
        placeholder="Paste JSON here"
      />
    </div>
  );
}
