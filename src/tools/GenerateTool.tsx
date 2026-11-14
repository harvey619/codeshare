import { useEffect, useMemo, useState } from "react";
import { randomString } from "./lib";
import { CopyButton } from "./shared";

const SETS = { lower: "abcdefghijklmnopqrstuvwxyz", upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", digits: "0123456789", symbols: "!@#$%^&*-_=+?" };
type SetName = keyof typeof SETS;
const LOOKALIKES = /[Il1O0o]/g;
const HASHES = ["SHA-256", "SHA-1", "SHA-512"] as const;

export default function GenerateTool() {
  const [uuids, setUuids] = useState<string[]>(() => [crypto.randomUUID()]);
  const [count, setCount] = useState(1);

  const [length, setLength] = useState(16);
  const [sets, setSets] = useState<Record<SetName, boolean>>({ lower: true, upper: true, digits: true, symbols: false });
  const [clear, setClear] = useState(true);
  const [round, setRound] = useState(0); // bump for a new password with the same options

  const [text, setText] = useState("");
  const [algo, setAlgo] = useState<(typeof HASHES)[number]>("SHA-256");
  const [hash, setHash] = useState("");

  const alphabet = () => {
    const all = (Object.keys(SETS) as SetName[]).filter((k) => sets[k]).map((k) => SETS[k]).join("");
    return clear ? all.replace(LOOKALIKES, "") : all;
  };
  // A fresh password whenever the options change or "New password" is pressed.
  const password = useMemo(() => {
    const chars = alphabet();
    return chars ? randomString(length, chars) : "";
  }, [length, sets, clear, round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let current = true;
    if (!text) return;
    crypto.subtle.digest(algo, new TextEncoder().encode(text)).then((buf) => {
      if (current) setHash([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    });
    return () => {
      current = false;
    };
  }, [text, algo]);

  const bits = Math.round(length * Math.log2(Math.max(2, alphabet().length)));

  return (
    <div className="stack">
      <section className="card">
        <h2>UUID</h2>
        <div className="json-bar">
          <label>How many <input className="num" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
          <button className="btn primary" onClick={() => setUuids(Array.from({ length: count }, () => crypto.randomUUID()))}>Generate</button>
          <CopyButton text={uuids.join("\n")} label={uuids.length > 1 ? "Copy all" : "Copy"} className="btn" />
        </div>
        <pre className="result" aria-label="UUIDs">{uuids.join("\n")}</pre>
      </section>

      <section className="card">
        <h2>Password</h2>
        <div className="json-bar">
          <label>Length <input type="range" min={6} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} /> <strong>{length}</strong></label>
          {(Object.keys(SETS) as SetName[]).map((k) => (
            <label key={k}><input type="checkbox" checked={sets[k]} onChange={(e) => setSets({ ...sets, [k]: e.target.checked })} /> {k}</label>
          ))}
          <label title="Leaves out I, l, 1, O, 0 and o"><input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} /> no look-alikes</label>
        </div>
        <pre className="result big" aria-label="Password">{password || "Pick at least one kind of character"}</pre>
        <div className="json-bar">
          <button className="btn primary" onClick={() => setRound(round + 1)}>New password</button>
          <CopyButton text={password} className="btn" />
          {password && <span className="side-note">about {bits} bits of randomness, made on this device</span>}
        </div>
      </section>

      <section className="card">
        <h2>Hash</h2>
        <div className="json-bar">
          <div className="seg" role="group" aria-label="Algorithm">
            {HASHES.map((h) => (
              <button key={h} className={algo === h ? "active" : ""} aria-pressed={algo === h} onClick={() => setAlgo(h)}>{h}</button>
            ))}
          </div>
          <CopyButton text={text ? hash : ""} className="btn small" />
        </div>
        <textarea className="code-area short" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to hash" aria-label="Text to hash" spellCheck={false} />
        <pre className="result" aria-label="Hash">{text ? hash : "The hash appears here"}</pre>
      </section>
    </div>
  );
}
