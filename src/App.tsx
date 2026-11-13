import { useEffect, useState } from "react";
import { resolveRoom } from "./room";
import { getTheme, saveTheme, type Theme } from "./theme";
import Editor from "./Editor";
import NewRoomDialog from "./NewRoomDialog";

export default function App() {
  const [room] = useState(resolveRoom);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [showNew, setShowNew] = useState(false);  

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="app">
      <header>
        <a className="brand" href="/">
          <img src="/favicon.svg" alt="" />
          harveys
        </a>
        <span className="room">/{room}</span>
        <div className="actions">
          <button className="btn primary" onClick={copyLink}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button className="btn" onClick={() => setShowNew(true)}>New room</button>
          <button
            className="btn icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>
      <Editor room={room} dark={theme === "dark"} />
      {showNew && <NewRoomDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}