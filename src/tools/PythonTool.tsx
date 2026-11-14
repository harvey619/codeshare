import { useCallback, useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { Runner, type OutLine, type RunEvent } from "../run/runner";
import { downloadBlob, useStored } from "./util";

const SAMPLE = `# Press Run (or Ctrl/Cmd + Enter)
name = "class"
for i in range(1, 4):
    print(f"Hello {name}, this is line {i}")

squares = [n * n for n in range(6)]
print("Squares:", squares)
`;

export default function PythonTool() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const runner = useRef<Runner | null>(null);
  const [saved, setSaved] = useStored("tools.python", SAMPLE);
  const initial = useRef(saved);
  const [stdin, setStdin] = useState("");
  const [lines, setLines] = useState<OutLine[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const dark = document.documentElement.dataset.theme !== "light";
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [basicSetup, python(), dark ? oneDark : [], EditorView.updateListener.of((u) => u.docChanged && setSaved(u.state.doc.toString()))],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      runner.current?.destroy();
      runner.current = null;
    };
  }, [setSaved]);

  const onEvent = useCallback((e: RunEvent) => {
    if (e.type === "out") setLines((prev) => [...prev.slice(-499), { stream: e.stream, text: e.text }]);
    else if (e.type === "status") setStatus(e.text);
    else {
      setRunning(false);
      setStatus(e.stopped ? "Stopped." : null);
    }
  }, []);

  function run() {
    runner.current ??= new Runner(onEvent);
    setLines([]);
    setRunning(true);
    setStatus("Running…");
    runner.current.run("py", view.current?.state.doc.toString() ?? "", stdin, []);
  }
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="stack">
      <div className="json-bar">
        {running ? (
          <button className="btn stop" onClick={() => runner.current?.stop()}>■ Stop</button>
        ) : (
          <button className="btn run" onClick={run}>▶ Run</button>
        )}
        <button className="btn" onClick={() => downloadBlob(new Blob([view.current?.state.doc.toString() ?? ""], { type: "text/plain" }), "main.py")}>Download .py</button>
        <span className="side-note">Runs in your browser with Pyodide. numpy, pandas and other common packages load when you import them.</span>
      </div>
      <div ref={host} className="py-editor" />
      <textarea className="stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} rows={1} placeholder="Input for input(): one answer per line, typed before you press Run" aria-label="Program input" />
      <div className="py-output" aria-label="Output" aria-live="polite">
        {lines.map((l, i) => (
          <pre key={i} className={`out ${l.stream}`}>{l.text}</pre>
        ))}
        {status && <p className="side-note">{status}</p>}
        {lines.length === 0 && !status && <p className="side-note">Output appears here.</p>}
      </div>
    </div>
  );
}
