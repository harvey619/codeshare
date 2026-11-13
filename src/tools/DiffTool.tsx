import { useDeferredValue, useMemo, useState } from "react";
import { diffRows, type Part } from "./diff";

const parts = (ps: Part[]) => ps.map((p, i) => (p.changed ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>));

export default function DiffTool() {
  const [a, setA] = useState("function greet(name) {\n  console.log('Hello ' + name)\n}\n");
  const [b, setB] = useState("function greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('class');\n");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);

  // Diff the deferred values so typing stays smooth on big inputs.
  const da = useDeferredValue(a);
  const db = useDeferredValue(b);
  const { rows, added, removed } = useMemo(
    () => diffRows(da, db, { ignoreWhitespace, ignoreCase }),
    [da, db, ignoreWhitespace, ignoreCase],
  );

  return (
    <div className="diff">
      <div className="diff-inputs">
        <label>
          Original
          <textarea className="code-area" value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} />
        </label>
        <label>
          Changed
          <textarea className="code-area" value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} />
        </label>
      </div>

      <div className="json-bar">
        <button className="btn" onClick={() => (setA(b), setB(a))}>⇄ Swap</button>
        <label>
          <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)} /> Ignore
          whitespace
        </label>
        <label>
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> Ignore case
        </label>
        <span className="diff-summary" role="status">
          {added || removed ? (
            <>
              <span className="plus">+{added}</span> <span className="minus">−{removed}</span>
            </>
          ) : (
            "No differences"
          )}
        </span>
      </div>

      <div className="diff-out" role="table" aria-label="Differences">
        {rows.map((r, i) => (
          <div key={i} className={`diff-row ${r.kind}`} role="row">
            <span className="no">{r.kind !== "add" ? r.oldNo : ""}</span>
            <span className="no">{r.kind !== "del" ? r.newNo : ""}</span>
            <span className="sign">{r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}</span>
            <code>{r.kind === "same" ? r.text : parts(r.parts)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
