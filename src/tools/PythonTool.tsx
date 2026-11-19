import { useCallback, useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { Runner, type OutLine, type RunEvent } from "../run/runner";
import { downloadBlob, useStored } from "./util";
import Output from "../run/Output";
import TurtleStage from "../run/TurtleStage";
import { TurtleView } from "../run/turtleView";

const SAMPLE = `# Press Run (or Ctrl/Cmd + Enter)
name = input("What's your name? ")
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
  const [waiting, setWaiting] = useState<{ prompt: string } | null>(null);
  const [interactive, setInteractive] = useState<boolean | null>(null);
  // Turtle drawings: the view is made on first use; `turtleOn` shows it.
  const turtle = useRef<TurtleView | null>(null);
  const [turtleOn, setTurtleOn] = useState<TurtleView | null>(null);
  const [turtleBusy, setTurtleBusy] = useState(false);
  const getTurtle = useCallback(() => (turtle.current ??= new TurtleView(setTurtleBusy, (ev) => runner.current?.turtleEvent(ev))), []);

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
    else if (e.type === "input") setWaiting({ prompt: e.prompt });
    else if (e.type === "mode") setInteractive(e.interactive);
    else if (e.type === "turtle") {
      getTurtle().push(e.ops);
      setTurtleOn(getTurtle());
    } else if (e.type === "turtleWait") getTurtle().whenPending(e.pending).then(() => runner.current?.turtleReady());
    else if (e.type === "turtleListen") getTurtle().focus();
    else if (e.type === "turtleEvents") {
      getTurtle().setListening(e.on);
      setTurtleOn(getTurtle());
    }
    else {
      setRunning(false);
      setWaiting(null);
      setStatus(e.stopped ? "Stopped." : null);
    }
  }, [getTurtle]);

  function run() {
    runner.current ??= new Runner(onEvent);
    setLines([]);
    turtle.current?.reset();
    setTurtleOn(null);
    setWaiting(null);
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
        {running || turtleBusy ? (
          <button
            className="btn stop"
            onClick={() => {
              runner.current?.stop();
              turtle.current?.stop();
            }}
          >
            ■ Stop
          </button>
        ) : (
          <button className="btn run" onClick={run}>▶ Run</button>
        )}
        <button className="btn" onClick={() => downloadBlob(new Blob([view.current?.state.doc.toString() ?? ""], { type: "text/plain" }), "main.py")}>Download .py</button>
        <span className="side-note">Runs in your browser with Pyodide. turtle, numpy, pandas and other common packages work when you import them.</span>
      </div>
      <div ref={host} className="py-editor" />
      {interactive === false && (
        <textarea className="stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} rows={1} placeholder="Answers for input(): one per line, typed before you press Run" aria-label="Answers" />
      )}
      {turtleOn && <TurtleStage view={turtleOn} className="tool" />}
      <div className="py-output" aria-label="Output" aria-live="polite">
        <Output
          lines={lines}
          status={status}
          waiting={waiting}
          empty="Output appears here."
          onAnswer={(text) => {
            setLines((prev) => [...prev, { stream: "input", text: (waiting?.prompt ?? "") + text }]);
            setWaiting(null);
            runner.current?.sendInput(text);
          }}
        />
      </div>
    </div>
  );
}
