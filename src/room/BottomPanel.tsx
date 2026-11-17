import { useEffect, useRef } from "react";
import type { OutLine } from "../run/runner";
import { Markdown } from "./markdown";
import Output from "../run/Output";

export type PanelTab = "output" | "preview" | "explain";

type Props = {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  lines: OutLine[];
  status: string | null;
  stdin: string;
  setStdin: (s: string) => void;
  /** Show the answers box (JavaScript prompt(), or Python in browsers that can't pause). */
  showAnswers: boolean;
  waiting: { prompt: string } | null;
  onAnswer: (text: string) => void;
  preview: { html: string; key: number } | null;
  onPreviewLog: (line: OutLine) => void;
  explain: { text: string; busy: boolean; error: string | null } | null;
  canExplain: boolean;
};

export default function BottomPanel(p: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { onPreviewLog } = p;

  // Console output from the HTML preview (a sandboxed iframe) arrives as messages.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__run || e.data.type !== "out") return;
      onPreviewLog({ stream: e.data.stream, text: String(e.data.text) });
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [onPreviewLog]);

  const tabs: [PanelTab, string][] = [["output", "Output"]];
  if (p.preview) tabs.push(["preview", "Preview"]);
  if (p.canExplain || p.explain) tabs.push(["explain", "Explain"]);

  return (
    <section className="panel" aria-label="Run output">
      <div className="panel-head">
        {tabs.map(([id, label]) => (
          <button key={id} className={`panel-tab${p.tab === id ? " active" : ""}`} onClick={() => p.onTab(id)}>
            {label}
            {id === "output" && p.lines.length > 0 && <span className="count">{p.lines.length}</span>}
          </button>
        ))}
        <button className="tab-x panel-close" onClick={p.onClose} title="Close panel" aria-label="Close panel">✕</button>
      </div>

      {p.tab === "output" && (
        <div className="panel-body output">
          <Output lines={p.lines} status={p.status} waiting={p.waiting} onAnswer={p.onAnswer} empty="Nothing printed yet. Press Run." />
          {p.showAnswers && (
            <textarea
              className="stdin"
              value={p.stdin}
              onChange={(e) => p.setStdin(e.target.value)}
              rows={1}
              placeholder="Answers for prompt() / input(): one per line, typed before you press Run"
              aria-label="Answers"
            />
          )}
        </div>
      )}

      {/* Kept mounted so switching tabs doesn't restart the page. */}
      {p.preview && (
        <iframe
          key={p.preview.key}
          ref={frame}
          className="panel-body preview"
          style={{ display: p.tab === "preview" ? "block" : "none" }}
          title="Page preview"
          sandbox="allow-scripts allow-modals allow-forms"
          srcDoc={p.preview.html}
        />
      )}

      {p.tab === "explain" && (
        <div className="panel-body explain">
          {p.explain?.error && <p className="side-note error">{p.explain.error}</p>}
          {p.explain?.text && <Markdown text={p.explain.text} />}
          {p.explain?.busy && <p className="side-note">{p.explain.text ? "…" : "Thinking…"}</p>}
          {!p.explain && <p className="side-note">Select some code (or none, for the whole file) and press Explain.</p>}
          {p.explain && !p.explain.busy && p.explain.text && (
            <p className="side-note">Written by an AI model. It can be wrong, so check it against the code.</p>
          )}
        </div>
      )}
    </section>
  );
}
