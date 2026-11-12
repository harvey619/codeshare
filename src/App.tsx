import { useState } from "react";
import { resolveRoom } from "./room";
import Editor from "./Editor";

export default function App() {
  const [room] = useState(resolveRoom);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="app">
      <header>
        <strong>{room}</strong>
        <button onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
        <a href="/">New room</a>
      </header>
      <Editor room={room} />
    </div>
  );
}