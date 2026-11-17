import { useCallback, useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { java } from "@codemirror/lang-java";
import { markdown } from "@codemirror/lang-markdown";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import { yCollab } from "y-codemirror.next";
import { oneDark } from "@codemirror/theme-one-dark";
import { LIMITS } from "../shared/limits";
import {
  LANGUAGES, MAIN_ID, MAX_TABS, NEW_ROOM_FILE, cleanFileName, dedupeTabs, languageOf, legacyMainName, textKey, withLanguage,
  type FileTab, type Language,
} from "../shared/files";
import { getLocalUser, saveLocalUser, type User } from "./presence";
import { compressImage, isAcceptedImage, uploadFile, uploadImage, type FileMeta, type ImageMeta } from "./images";
import Sidebar from "./Sidebar";
import Tabs from "./room/Tabs";
import BottomPanel, { type PanelTab } from "./room/BottomPanel";
import HistoryDialog from "./room/HistoryDialog";
import { Runner, runKind, type OutLine, type RunEvent } from "./run/runner";
import { buildHtml } from "./run/buildHtml";

const LANG_EXT: Record<Language, () => Extension> = {
  Markdown: () => markdown(),
  JavaScript: () => javascript(),
  TypeScript: () => javascript({ typescript: true }),
  Python: () => python(),
  HTML: () => html(),
  CSS: () => css(),
  Java: () => java(),
  "Plain text": () => [],
};

const sizeLimit = EditorState.changeFilter.of((tr) => tr.newDoc.length <= LIMITS.docChars);

type Status = "connecting" | "live" | "offline";
const CLOSE_REASONS: Record<number, string> = {
  1008: "You were sending too fast. Reconnecting…",
  1009: "That change was too large to send.",
  1013: "This room is full (50 people max).",
  4000: "This room expired after 2 weeks without edits.",
  4001: "The teacher ended this session. Refresh the page to rejoin.",
  4002: "The teacher deleted this room. Refresh the page to start fresh.",
};
// Close codes that mean "don't reconnect on your own".
const FINAL = new Set([4001, 4002]);

type Other = User & { id: number; hand: boolean; tab?: string; line?: number };

const ZOOM_KEY = "codeshare-font-size";
const ZOOM_MIN = 10;
const ZOOM_MAX = 64;
const zoomStep = (z: number) => (z < 20 ? 2 : 4);
function loadZoom() {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY));
    return n >= ZOOM_MIN && n <= ZOOM_MAX ? n : 14;
  } catch {
    return 14;
  }
}

const MAX_LINES = 500;

type Session = {
  doc: Y.Doc;
  provider: YProvider;
  ytabs: Y.Array<FileTab>;
  view: EditorView;
  open: (id: string) => void;
};

type Props = {
  /** The room name, or null when opened through a view-only link. */
  room: string | null;
  viewToken?: string;
  dark: boolean;
};

export default function Editor({ room, viewToken, dark }: Props) {
  const readOnly = room === null;
  const apiBase = room ? `/api/rooms/${room}` : `/api/view/${viewToken}`;

  const host = useRef<HTMLDivElement>(null);
  const language = useRef(new Compartment());
  const theme = useRef(new Compartment());
  const session = useRef<Session | null>(null);
  const darkRef = useRef(dark);

  const [status, setStatus] = useState<Status>("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [me, setMe] = useState(getLocalUser);
  const [hand, setHand] = useState(false);
  const [others, setOthers] = useState<Other[]>([]);
  const [following, setFollowing] = useState<number | null>(null);
  const followingRef = useRef<number | null>(null);

  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [active, setActive] = useState(MAIN_ID);
  const activeRef = useRef(MAIN_ID);
  const tabsRef = useRef<FileTab[]>([]);

  const [images, setImages] = useState<ImageMeta[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<(list: File[]) => void>(() => {});

  const [zoom, setZoom] = useState(loadZoom);
  const [historyDoc, setHistoryDoc] = useState<Y.Doc | null>(null);

  // Run / preview / explain panel (local to each person, not shared).
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [lines, setLines] = useState<OutLine[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState("");
  const [waiting, setWaiting] = useState<{ prompt: string } | null>(null);
  const [pyInteractive, setPyInteractive] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<{ html: string; key: number } | null>(null);
  const [explain, setExplain] = useState<{ text: string; busy: boolean; error: string | null } | null>(null);
  const runner = useRef<Runner | null>(null);

  const shownTabs = tabs.length ? tabs : [{ id: MAIN_ID, name: NEW_ROOM_FILE }];
  const activeTab = shownTabs.find((t) => t.id === active) ?? shownTabs[0];
  const kind = runKind(activeTab.name);

  useEffect(() => {
    const doc = new Y.Doc();
    const ymeta = doc.getMap<string>("meta");
    const ytabs = doc.getArray<FileTab>("tabs");
    const undo = new Map<string, Y.UndoManager>();

    const provider = room
      ? new YProvider(location.host, room, doc, { party: "room" })
      : new YProvider(location.host, viewToken!, doc, { party: "view" });
    const awareness = provider.awareness;
    const local = getLocalUser();
    awareness.setLocalStateField("user", { ...local, colorLight: local.color + "33" });

    // A new room starts with notes.md; a room from before files existed keeps its code's language.
    const firstName = () => {
      const lang = ymeta.get("language");
      if (lang) return legacyMainName(lang);
      return doc.getText("code").length ? legacyMainName(undefined) : NEW_ROOM_FILE;
    };
    const currentTabs = () => {
      const list = dedupeTabs(ytabs.toArray());
      return list.length ? list : [{ id: MAIN_ID, name: firstName() }];
    };
    const nameOf = (id: string) => currentTabs().find((t) => t.id === id)?.name ?? "main.js";

    const makeState = (id: string) => {
      const ytext = doc.getText(textKey(id));
      let undoManager = undo.get(id);
      if (!undoManager) {
        undoManager = new Y.UndoManager(ytext);
        undo.set(id, undoManager);
      }
      return EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          sizeLimit,
          language.current.of(LANG_EXT[languageOf(nameOf(id))]()),
          theme.current.of(darkRef.current ? oneDark : []),
          readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
          yCollab(ytext, awareness, { undoManager }),
        ],
      });
    };

    const view = new EditorView({ parent: host.current!, state: makeState(MAIN_ID) });

    // Tell others which file and line we're looking at, so they can follow.
    let publishTimer: ReturnType<typeof setTimeout> | null = null;
    const publishView = () => {
      if (publishTimer) return;
      publishTimer = setTimeout(() => {
        publishTimer = null;
        const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
        awareness.setLocalStateField("view", { tab: activeRef.current, line: view.state.doc.lineAt(top.from).number });
      }, 200);
    };
    view.scrollDOM.addEventListener("scroll", publishView, { passive: true });

    const open = (id: string) => {
      if (!currentTabs().some((t) => t.id === id)) return;
      activeRef.current = id;
      setActive(id);
      view.setState(makeState(id));
      view.scrollDOM.scrollTop = 0;
      publishView();
    };

    let lastName = "";
    const syncTabs = () => {
      const list = currentTabs();
      tabsRef.current = list;
      setTabs(list);
      if (!list.some((t) => t.id === activeRef.current)) {
        open(list[0].id); // the open file was deleted by someone
      } else {
        const name = nameOf(activeRef.current);
        if (name !== lastName) {
          view.dispatch({ effects: language.current.reconfigure(LANG_EXT[languageOf(name)]()) });
        }
      }
      lastName = nameOf(activeRef.current);
    };
    ytabs.observe(syncTabs);
    ymeta.observe(syncTabs);
    syncTabs();

    // The first person into a room creates the first tab (named after the old language setting).
    provider.on("synced", () => {
      if (!readOnly && ytabs.length === 0) {
        ytabs.push([{ id: MAIN_ID, name: firstName() }]);
      }
    });

    let lastFollow = "";
    const onAwareness = () => {
      const list: Other[] = [];
      awareness.getStates().forEach((state, id) => {
        if (id === awareness.clientID || !state.user) return;
        list.push({ ...state.user, id, hand: !!state.hand, tab: state.view?.tab, line: state.view?.line });
      });
      list.sort((a, b) => Number(b.hand) - Number(a.hand));
      setOthers(list);

      const target = followingRef.current;
      if (target === null) return;
      const them = list.find((o) => o.id === target);
      if (!them) {
        followingRef.current = null;
        setFollowing(null);
        return;
      }
      if (!them.tab || !them.line) return;
      const key = `${them.tab}:${them.line}`;
      if (key === lastFollow && them.tab === activeRef.current) return;
      lastFollow = key;
      if (them.tab !== activeRef.current) open(them.tab);
      const line = Math.min(them.line, view.state.doc.lines);
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "start" }) });
    };
    awareness.on("change", onAwareness);

    provider.on("status", ({ status }: { status: string }) => {
      setStatus(status === "connected" ? "live" : status === "connecting" ? "connecting" : "offline");
    });
    provider.on("connection-close", (event: CloseEvent | null) => {
      const reason = event && CLOSE_REASONS[event.code];
      if (reason) setNotice(reason);
      if (event && FINAL.has(event.code)) provider.disconnect();
    });
    provider.on("custom-message", (message: string) => {
      if (message === "too-large") setNotice("This room is too large to save. Delete some content.");
    });

    const yimages = doc.getArray<ImageMeta>("images");
    const updateImages = () => setImages(yimages.toArray());
    yimages.observe(updateImages);
    const yfiles = doc.getArray<FileMeta>("files");
    const updateFiles = () => setFiles(yfiles.toArray());
    yfiles.observe(updateFiles);

    async function upload(list: File[]) {
      if (list.length === 0 || !room) return;
      setUploadError(null);
      setUploading(true);
      try {
        for (const file of list) {
          if (isAcceptedImage(file)) {
            const { blob, w, h } = await compressImage(file, LIMITS.imageBytes);
            const id = await uploadImage(room, blob);
            yimages.push([{ id, name: file.name || "pasted image", w, h, size: blob.size, addedAt: Date.now() }]);
          } else {
            if (file.size > LIMITS.fileBytes) throw new Error(`${file.name} is over 10 MB`);
            yfiles.push([await uploadFile(room, file)]);
          }
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    }
    uploadRef.current = upload;

    const onPaste = (e: ClipboardEvent) => {
      const list = [...(e.clipboardData?.files ?? [])];
      if (list.length === 0 || readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      upload(list);
    };
    const onDrop = (e: DragEvent) => {
      const list = [...(e.dataTransfer?.files ?? [])];
      if (list.length === 0 || readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      upload(list);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();

    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragover", onDragOver);

    session.current = { doc, provider, ytabs, view, open };

    return () => {
      session.current = null;
      if (publishTimer) clearTimeout(publishTimer);
      ytabs.unobserve(syncTabs);
      ymeta.unobserve(syncTabs);
      yimages.unobserve(updateImages);
      yfiles.unobserve(updateFiles);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragover", onDragOver);
      awareness.off("change", onAwareness);
      view.destroy();
      provider.destroy();
      // y-partyserver's connect() is async and can open the socket after destroy() (React's
      // dev double-mount does exactly this). Disconnect again once it has run.
      setTimeout(() => provider.disconnect(), 0);
      doc.destroy();
      activeRef.current = MAIN_ID;
    };
  }, [room, viewToken, readOnly]);

  useEffect(() => {
    darkRef.current = dark;
    session.current?.view.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) });
  }, [dark]);

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      // not remembered in private mode
    }
    session.current?.view.requestMeasure();
  }, [zoom]);

  useEffect(() => () => runner.current?.destroy(), []);

  // ---- files (tabs) ----

  function replaceTab(id: string, next: FileTab) {
    const s = session.current;
    if (!s) return;
    const index = s.ytabs.toArray().findIndex((t) => t.id === id);
    s.doc.transact(() => {
      if (index === -1) s.ytabs.push([next]); // old single-file room: first rename creates the tab
      else {
        s.ytabs.delete(index, 1);
        s.ytabs.insert(index, [next]);
      }
    });
  }

  function askName(current: string, takenBy: string | null) {
    const raw = prompt("File name (for example app.js, style.css, main.py)", current);
    if (raw === null) return null;
    const name = cleanFileName(raw);
    if (!name) return null;
    if (tabsRef.current.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== takenBy)) {
      alert(`There's already a file called ${name}.`);
      return null;
    }
    return name;
  }

  function addTab() {
    const s = session.current;
    if (!s || tabsRef.current.length >= MAX_TABS) return;
    const name = askName(`file${tabsRef.current.length + 1}.js`, null);
    if (!name) return;
    const id = Math.random().toString(36).slice(2, 10);
    s.ytabs.push([{ id, name }]);
    s.open(id);
  }

  function renameTab(id: string) {
    const tab = tabsRef.current.find((t) => t.id === id);
    if (!tab) return;
    const name = askName(tab.name, id);
    if (name && name !== tab.name) replaceTab(id, { id, name });
  }

  function deleteTab(id: string) {
    const s = session.current;
    const tab = tabsRef.current.find((t) => t.id === id);
    if (!s || !tab || tabsRef.current.length < 2) return;
    if (!confirm(`Delete ${tab.name} for everyone? (History can bring it back.)`)) return;
    const index = s.ytabs.toArray().findIndex((t) => t.id === id);
    s.doc.transact(() => {
      if (index !== -1) s.ytabs.delete(index, 1);
      const text = s.doc.getText(textKey(id));
      text.delete(0, text.length);
    });
  }

  function setLanguage(lang: Language) {
    replaceTab(activeTab.id, { id: activeTab.id, name: withLanguage(activeTab.name, lang) });
  }

  // ---- toolbar actions ----

  const code = () => session.current?.view.state.doc.toString() ?? "";

  async function copyCode() {
    await navigator.clipboard.writeText(code());
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([code()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = activeTab.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function rename() {
    const name = prompt("Your name", me.name)?.trim().slice(0, 30);
    if (!name) return;
    const user = { ...me, name };
    saveLocalUser(user);
    setMe(user);
    session.current?.provider.awareness.setLocalStateField("user", { ...user, colorLight: user.color + "33" });
  }

  function toggleHand() {
    session.current?.provider.awareness.setLocalStateField("hand", !hand);
    setHand(!hand);
  }

  function follow(id: number | null) {
    followingRef.current = id;
    setFollowing(id);
    // Changing our own state fires the awareness handler, so we jump to them straight away.
    session.current?.provider.awareness.setLocalStateField("following", id);
  }

  // ---- run ----

  const addLine = useCallback((line: OutLine) => {
    setLines((prev) => (prev.length >= MAX_LINES ? [...prev.slice(1), line] : [...prev, line]));
  }, []);

  const onRunEvent = useCallback(
    (e: RunEvent) => {
      if (e.type === "out") addLine({ stream: e.stream, text: e.text });
      else if (e.type === "status") setRunStatus(e.text);
      else if (e.type === "input") setWaiting({ prompt: e.prompt });
      else if (e.type === "mode") setPyInteractive(e.interactive);
      else {
        setRunning(false);
        setWaiting(null);
        setRunStatus(e.stopped ? "Stopped." : null);
      }
    },
    [addLine],
  );

  function run() {
    const s = session.current;
    if (!s || !kind) return;
    const all = tabsRef.current.map((t) => ({ name: t.name, text: s.doc.getText(textKey(t.id)).toString() }));
    const mine = code();
    const rest = all.filter((f) => f.name !== activeTab.name);
    setLines([]);
    if (kind === "md") {
      setRunStatus(null);
      setPanel("preview");
      import("./run/markdownPage").then(({ markdownPage }) =>
        setPreview((p) => ({ html: markdownPage(mine), key: (p?.key ?? 0) + 1 })),
      );
      return;
    }
    if (kind === "html") {
      setRunStatus(null);
      setPreview((p) => ({ html: buildHtml(mine, rest), key: (p?.key ?? 0) + 1 }));
      setPanel("preview");
      return;
    }
    runner.current ??= new Runner(onRunEvent);
    setWaiting(null);
    setRunning(true);
    setRunStatus("Running…");
    setPanel("output");
    runner.current.run(kind, mine, stdin, rest);
  }
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  // Ctrl/Cmd + Enter runs the current file.
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

  // ---- explain ----

  async function explainCode() {
    const view = session.current?.view;
    if (!view || !room) return;
    const sel = view.state.selection.main;
    const text = sel.empty ? view.state.doc.toString() : view.state.sliceDoc(sel.from, sel.to);
    setPanel("explain");
    if (!text.trim()) return setExplain({ text: "", busy: false, error: "There's no code to explain yet." });
    setExplain({ text: "", busy: true, error: null });
    try {
      const res = await fetch(`${apiBase}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: text, language: languageOf(activeTab.name), file: activeTab.name }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't get an explanation");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let all = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        all += decoder.decode(value, { stream: true });
        setExplain({ text: all, busy: true, error: null });
      }
      setExplain({ text: all, busy: false, error: all ? null : "The AI returned nothing. Try again." });
    } catch (err) {
      setExplain({ text: "", busy: false, error: err instanceof Error ? err.message : "Couldn't get an explanation" });
    }
  }

  const followed = others.find((o) => o.id === following);

  return (
    <>
      <div className="toolbar">
        <select
          value={languageOf(activeTab.name)}
          onChange={(e) => setLanguage(e.target.value as Language)}
          disabled={readOnly}
          aria-label="Language"
        >
          {LANGUAGES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        {kind &&
          (running ? (
            <button className="btn small stop" onClick={() => runner.current?.stop()}>■ Stop</button>
          ) : (
            <button className="btn small run" onClick={run} title={`${kind === "md" ? "Show formatted" : "Run this file"} (Ctrl/Cmd + Enter)`}>
              {kind === "md" ? "▶ Preview" : "▶ Run"}
            </button>
          ))}
        <span className="zoom">
          <button className="btn small" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - zoomStep(z - 1)))} disabled={zoom <= ZOOM_MIN} title="Smaller text" aria-label="Smaller text">A−</button>
          <button className="btn small" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + zoomStep(z)))} disabled={zoom >= ZOOM_MAX} title="Bigger text" aria-label="Bigger text">A+</button>
        </span>
        <button className="btn small" onClick={copyCode}>{codeCopied ? "Copied ✓" : "Copy code"}</button>
        <button className="btn small" onClick={download} title={`Download ${activeTab.name}`}>Download</button>
        {!readOnly && <button className="btn small" onClick={() => setHistoryDoc(session.current?.doc ?? null)}>History</button>}
        {!readOnly && <button className="btn small" onClick={explainCode} disabled={explain?.busy}>Explain</button>}
        <button className={`btn small${hand ? " on" : ""}`} onClick={toggleHand} aria-pressed={hand} title={hand ? "Lower hand" : "Raise hand"} aria-label={hand ? "Lower hand" : "Raise hand"}>
          ✋{hand ? " Lower" : ""}
        </button>
        <span className={`status ${status}`}>{status}</span>
        {readOnly && <span className="chip">View only</span>}
        {followed && (
          <button className="chip" onClick={() => follow(null)} title="Stop following">
            Following {followed.name} ✕
          </button>
        )}
        {notice && (
          <button className="notice" onClick={() => setNotice(null)} title="Dismiss">
            {notice} ✕
          </button>
        )}
        <ul className="people">
          <li>
            <button className="person" onClick={rename} title="Rename yourself">
              <span className="dot" style={{ background: me.color }} />
              {hand && "✋ "}
              {me.name} (you)
            </button>
          </li>
          {others.map((u) => (
            <li key={u.id} className="person">
              <button
                className={`person-btn${following === u.id ? " on" : ""}`}
                onClick={() => follow(following === u.id ? null : u.id)}
                title={following === u.id ? `Stop following ${u.name}` : `Follow ${u.name}'s screen`}
              >
                <span className="dot" style={{ background: u.color }} />
                {u.hand && "✋ "}
                {u.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Tabs
        tabs={shownTabs}
        active={activeTab.id}
        readOnly={readOnly}
        onOpen={(id) => session.current?.open(id)}
        onAdd={addTab}
        onRename={renameTab}
        onDelete={deleteTab}
      />
      <div className="workspace">
        <div className="main">
          <div ref={host} className="editor" style={{ fontSize: zoom }} />
          {panel && (
            <BottomPanel
              tab={panel}
              onTab={setPanel}
              onClose={() => setPanel(null)}
              lines={lines}
              status={runStatus}
              stdin={stdin}
              showAnswers={kind === "js" || (kind === "py" && pyInteractive === false)}
              waiting={waiting}
              onAnswer={(text) => {
                addLine({ stream: "input", text: (waiting?.prompt ?? "") + text });
                setWaiting(null);
                runner.current?.sendInput(text);
              }}
              setStdin={setStdin}
              preview={preview}
              onPreviewLog={addLine}
              explain={explain}
              canExplain={!readOnly}
            />
          )}
        </div>
        <Sidebar
          base={apiBase}
          readOnly={readOnly}
          images={images}
          files={files}
          error={uploadError}
          busy={uploading}
          onPick={(list) => uploadRef.current(list)}
        />
      </div>
      {historyDoc && room && <HistoryDialog room={room} doc={historyDoc} onClose={() => setHistoryDoc(null)} />}
    </>
  );
}
