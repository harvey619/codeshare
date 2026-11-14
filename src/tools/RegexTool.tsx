import { useMemo, useState, type ReactNode } from "react";

const FLAGS: [string, string][] = [["g", "all matches"], ["i", "ignore case"], ["m", "multiline ^ $"], ["s", ". matches newline"]];
const MAX_MATCHES = 500;

export default function RegexTool() {
  const [pattern, setPattern] = useState("(\\w+)@(\\w+)\\.com");
  const [flags, setFlags] = useState("gi");
  const [text, setText] = useState("Write to ana@school.com or BEN@class.com.\nNot an email: hello@world");

  const result = useMemo(() => {
    if (!pattern) return { matches: [] as RegExpExecArray[], error: null as string | null };
    try {
      const re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
      const matches: RegExpExecArray[] = [];
      for (const m of text.matchAll(re)) {
        matches.push(m as RegExpExecArray);
        if (matches.length >= MAX_MATCHES || !flags.includes("g")) break;
      }
      return { matches, error: null };
    } catch (err) {
      return { matches: [], error: err instanceof Error ? err.message : "Invalid pattern" };
    }
  }, [pattern, flags, text]);

  const highlighted = useMemo(() => {
    const out: ReactNode[] = [];
    let at = 0;
    result.matches.forEach((m, i) => {
      if (m[0] === "") return;
      out.push(text.slice(at, m.index));
      out.push(<mark key={i}>{m[0]}</mark>);
      at = m.index + m[0].length;
    });
    out.push(text.slice(at));
    return out;
  }, [result.matches, text]);

  return (
    <div className="stack">
      <div className="regex-row">
        <span className="slash">/</span>
        <input className="code-input" value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} aria-label="Pattern" placeholder="pattern" />
        <span className="slash">/{flags}</span>
      </div>
      <div className="json-bar">
        {FLAGS.map(([f, label]) => (
          <label key={f}>
            <input type="checkbox" checked={flags.includes(f)} onChange={(e) => setFlags(e.target.checked ? flags + f : flags.replace(f, ""))} /> <code>{f}</code> {label}
          </label>
        ))}
      </div>
      {result.error ? (
        <p className="json-status bad" role="status">✗ {result.error}</p>
      ) : (
        <p className="json-status ok" role="status">
          {result.matches.length} {result.matches.length === 1 ? "match" : "matches"}
          {result.matches.length >= MAX_MATCHES && " (showing the first 500)"}
        </p>
      )}
      <label className="field">
        Test text
        <textarea className="code-area" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <div className="regex-out" aria-label="Highlighted matches">{highlighted}</div>
      {result.matches.length > 0 && (
        <table className="grid-table">
          <thead>
            <tr><th>#</th><th>Match</th><th>Groups</th><th>At</th></tr>
          </thead>
          <tbody>
            {result.matches.slice(0, 50).map((m, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><code>{m[0]}</code></td>
                <td>{m.slice(1).map((g, j) => <code key={j} className="group">{g ?? "∅"}</code>)}</td>
                <td>{m.index}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
