import { useMemo, useState } from "react";
import { base64Decode, base64Encode, decodeJwt, htmlDecode, htmlEncode } from "./lib";
import { CopyButton } from "./shared";

type Mode = "Base64" | "URL" | "HTML" | "JWT";
const MODES: Mode[] = ["Base64", "URL", "HTML", "JWT"];

function convert(mode: Mode, decode: boolean, input: string): string {
  if (mode === "JWT") {
    const { header, payload } = decodeJwt(input);
    const times = (["iat", "nbf", "exp"] as const)
      .filter((k) => typeof payload[k] === "number")
      .map((k) => `${k}: ${new Date((payload[k] as number) * 1000).toLocaleString()}`);
    return `// header\n${JSON.stringify(header, null, 2)}\n\n// payload\n${JSON.stringify(payload, null, 2)}${times.length ? `\n\n// times\n${times.join("\n")}` : ""}`;
  }
  if (mode === "Base64") return decode ? base64Decode(input) : base64Encode(input);
  if (mode === "URL") return decode ? decodeURIComponent(input) : encodeURIComponent(input);
  return decode ? htmlDecode(input) : htmlEncode(input);
}

export default function EncodeTool() {
  const [mode, setMode] = useState<Mode>("Base64");
  const [decode, setDecode] = useState(false);
  const [input, setInput] = useState("Hello, class! 👋");
  const isJwt = mode === "JWT";

  const { output, error } = useMemo(() => {
    if (!input) return { output: "", error: null };
    try {
      return { output: convert(mode, decode || isJwt, input), error: null };
    } catch (err) {
      const why = err instanceof Error && isJwt ? err.message : `That isn't valid ${mode} to decode`;
      return { output: "", error: why };
    }
  }, [mode, decode, isJwt, input]);

  return (
    <div className="stack">
      <div className="json-bar">
        <div className="seg" role="group" aria-label="Format">
          {MODES.map((m) => (
            <button key={m} className={mode === m ? "active" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        {!isJwt && (
          <div className="seg" role="group" aria-label="Direction">
            <button className={!decode ? "active" : ""} aria-pressed={!decode} onClick={() => setDecode(false)}>Encode</button>
            <button className={decode ? "active" : ""} aria-pressed={decode} onClick={() => setDecode(true)}>Decode</button>
          </div>
        )}
        {!isJwt && <button className="btn small" disabled={!output} onClick={() => (setInput(output), setDecode(!decode))}>⇅ Swap</button>}
      </div>
      <label className="field">
        {isJwt ? "Token" : "Input"}
        <textarea className="code-area short" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder={isJwt ? "Paste a JWT (eyJ…)" : ""} />
      </label>
      {isJwt && <p className="side-note">Decoded here in your browser. This shows what's inside a token; it does not check the signature.</p>}
      {error && <p className="json-status bad" role="status">✗ {error}</p>}
      <label className="field">
        <span className="field-head">Output <CopyButton text={output} /></span>
        <textarea className="code-area short" value={output} readOnly spellCheck={false} aria-label="Output" />
      </label>
    </div>
  );
}
