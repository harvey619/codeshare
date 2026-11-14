import { useEffect, useRef, useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { downloadBlob } from "./util";

// The drawing is kept in this browser so it's still there after a refresh.
const KEY = "tools.whiteboard";
type Scene = { elements: readonly unknown[]; files: Record<string, unknown> };
type Api = { getSceneElements(): readonly unknown[]; getAppState(): Record<string, unknown>; getFiles(): Record<string, unknown>; resetScene(): void };

function load(): Scene | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Scene) : null;
  } catch {
    return null;
  }
}

export default function WhiteboardTool() {
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark") as "light" | "dark");
  const [initial] = useState(load);
  const api = useRef<Api | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [full, setFull] = useState(true);

  // Follow the site's light/dark toggle.
  useEffect(() => {
    const watch = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);

  function save(elements: readonly unknown[], files: Record<string, unknown>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const alive = elements.filter((e) => !(e as { isDeleted?: boolean }).isDeleted);
        localStorage.setItem(KEY, JSON.stringify({ elements: alive, files }));
        setFull(true);
      } catch {
        setFull(false); // browser storage is full (usually big pasted images)
      }
    }, 600);
  }

  async function png() {
    const a = api.current;
    if (!a) return;
    const blob = await exportToBlob({
      elements: a.getSceneElements() as never,
      appState: { ...a.getAppState(), exportBackground: true, exportWithDarkMode: theme === "dark" } as never,
      files: a.getFiles() as never,
      mimeType: "image/png",
      exportPadding: 24,
    });
    downloadBlob(blob, "whiteboard.png");
  }

  return (
    <div className="board-wrap">
      <div className="json-bar">
        <button className="btn small" onClick={png}>Download PNG</button>
        <button className="btn small" onClick={() => confirm("Clear the whole board?") && api.current?.resetScene()}>Clear</button>
        <span className="side-note">
          {full ? "Saved in this browser as you draw. Press 1-9 for tools, K for the laser pointer." : "This board is too big to save in the browser. Download it to keep it."}
        </span>
      </div>
      <div className="board">
        <Excalidraw
          excalidrawAPI={(a) => (api.current = a as unknown as Api)}
          initialData={{ elements: (initial?.elements ?? []) as never, files: (initial?.files ?? {}) as never, appState: { currentItemFontFamily: 5 } as never }}
          theme={theme}
          onChange={(elements, _state, files) => save(elements, files as Record<string, unknown>)}
          UIOptions={{ canvasActions: { loadScene: true, export: { saveFileToDisk: true }, saveAsImage: true, toggleTheme: false } }}
        />
      </div>
    </div>
  );
}
