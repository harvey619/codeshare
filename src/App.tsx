import { useEffect, useState } from "react";
import { resolveRoom } from "./room";
import { getTheme, saveTheme, type Theme } from "./theme";
import Editor from "./Editor";

export default function App() {
  const [room] = useState(resolveRoom);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme);

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
          <a className="btn" href="/">New room</a>
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
    </div>
  );
}