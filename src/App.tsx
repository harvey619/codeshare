import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { resolveRoom } from "./room";
import { getTheme, saveTheme, type Theme } from "./theme";
import Editor from "./Editor";
import NewRoomDialog from "./NewRoomDialog";

// Tools are a separate chunk, so code rooms never download them.
const ToolsPage = lazy(() => import("./tools/ToolsPage"));

const isToolsPath = (path: string) => /^\/tools(\/|$)/.test(path);

export default function App() {
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  const toggle = (
    <button
      className="btn icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );

  if (isToolsPath(location.pathname)) {
    return (
      <div className="app">
        <Header label="/tools" actions={<><a className="btn" href="/">Code room</a>{toggle}</>} />
        <Suspense fallback={<p className="tools-loading">Loading…</p>}>
          <ToolsPage />
        </Suspense>
      </div>
    );
  }
  return <RoomApp dark={theme === "dark"} toggle={toggle} />;
}

function Header({ label, actions }: { label: string; actions: ReactNode }) {
  return (
    <header>
      <a className="brand" href="/">
        <img src="/favicon.svg" alt="" />
        harveys
      </a>
      <span className="room">{label}</span>
      <div className="actions">{actions}</div>
    </header>
  );
}

function RoomApp({ dark, toggle }: { dark: boolean; toggle: ReactNode }) {
  const [room] = useState(resolveRoom);
  const [copied, setCopied] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="app">
      <Header
        label={`/${room}`}
        actions={
          <>
            <button className="btn primary" onClick={copyLink}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button className="btn" onClick={() => setShowNew(true)}>New room</button>
            <a className="btn" href="/tools">Tools</a>
            {toggle}
          </>
        }
      />
      <Editor room={room} dark={dark} />
      {showNew && <NewRoomDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}
