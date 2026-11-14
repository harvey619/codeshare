import { useEffect, useState } from "react";
import { parseTimestamp } from "./lib";
import { CopyButton } from "./shared";

function relative(date: Date, now: number) {
  const s = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(s);
  const [n, unit] = abs < 60 ? [abs, "second"] : abs < 3600 ? [Math.round(abs / 60), "minute"] : abs < 86400 ? [Math.round(abs / 3600), "hour"] : abs < 86400 * 365 ? [Math.round(abs / 86400), "day"] : [Math.round(abs / (86400 * 365)), "year"];
  const label = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return s === 0 ? "now" : s < 0 ? `${label} ago` : `in ${label}`;
}

// <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm:ss
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

export default function TimeTool() {
  const [now, setNow] = useState(() => Date.now());
  const [stamp, setStamp] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [local, setLocal] = useState(() => toLocalInput(new Date()));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = parseTimestamp(stamp);
  const fromLocal = local ? new Date(local) : null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows: [string, string][] = date
    ? [
        [`Your time (${zone})`, date.toLocaleString([], { dateStyle: "full", timeStyle: "long" })],
        ["UTC", date.toUTCString()],
        ["ISO 8601", date.toISOString()],
        ["Relative", relative(date, now)],
      ]
    : [];

  return (
    <div className="stack">
      <section className="card">
        <h2>Right now</h2>
        <div className="json-bar">
          <pre className="result inline">{Math.floor(now / 1000)}</pre>
          <CopyButton text={String(Math.floor(now / 1000))} />
          <button className="btn small" onClick={() => setStamp(String(Math.floor(Date.now() / 1000)))}>Use below</button>
        </div>
      </section>

      <section className="card">
        <h2>Timestamp to date</h2>
        <input className="code-input" value={stamp} onChange={(e) => setStamp(e.target.value)} aria-label="Unix timestamp" placeholder="1700000000 (seconds) or 1700000000000 (milliseconds)" />
        {!date && stamp.trim() && <p className="json-status bad" role="status">✗ That isn't a timestamp (numbers only)</p>}
        {date && (
          <table className="grid-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><th>{k}</th><td>{v}</td><td><CopyButton text={v} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Date to timestamp</h2>
        <input className="code-input" type="datetime-local" step={1} value={local} onChange={(e) => setLocal(e.target.value)} aria-label="Date and time" />
        {fromLocal && !Number.isNaN(fromLocal.getTime()) && (
          <table className="grid-table">
            <tbody>
              <tr><th>Seconds</th><td>{Math.floor(fromLocal.getTime() / 1000)}</td><td><CopyButton text={String(Math.floor(fromLocal.getTime() / 1000))} /></td></tr>
              <tr><th>Milliseconds</th><td>{fromLocal.getTime()}</td><td><CopyButton text={String(fromLocal.getTime())} /></td></tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
