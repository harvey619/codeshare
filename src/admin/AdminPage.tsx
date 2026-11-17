import { useCallback, useEffect, useState } from "react";

// The teacher's dashboard: every room the directory knows about, with End and Delete.
// The admin token is kept in this browser only.

type Room = { name: string; size: number; people: number; images: number; files: number; lastEdit: number | null; expires: number | null; updated: number };
type Data = { rooms: Room[]; totals: { rooms: number; active: number; people: number; bytes: number } };

const KEY = "codeshare-admin-token";
const FREE_STORAGE = 5 * 1024 ** 3; // Workers Free: 5 GB of Durable Object storage in total

const size = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);
function ago(t: number | null) {
  if (!t) return "–";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
const until = (t: number | null) => (t ? `in ${Math.max(0, Math.round((t - Date.now()) / 86400000))} days` : "–");

function loadToken() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export default function AdminPage() {
  const [token, setToken] = useState(loadToken);
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, method = "GET") => {
      const res = await fetch(`/api/admin/${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        try {
          localStorage.removeItem(KEY);
        } catch {
          // ignore
        }
        setToken("");
      }
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setData(await api("rooms"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load rooms");
    }
  }, [api, token]);

  useEffect(() => {
    document.title = "Admin · harveys";
    if (!token) return;
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [token, refresh]);

  async function act(room: Room, action: "end" | "delete") {
    const ask =
      action === "end"
        ? `End the session in /${room.name}? Everyone is disconnected; the content stays.`
        : `Delete /${room.name} for good? Its code, files, images and history are erased. This can't be undone.`;
    if (!confirm(ask)) return;
    setBusy(`${room.name}:${action}`);
    try {
      await api(`rooms/${encodeURIComponent(room.name)}/${action}`, "POST");
      setTimeout(refresh, 1500); // the room reports its new state about a second later
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    }
    setBusy(null);
  }

  if (!token) {
    return (
      <main className="tools admin">
        <h1>Admin</h1>
        <form
          className="card admin-login"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            try {
              localStorage.setItem(KEY, t);
            } catch {
              // kept for this visit only
            }
            setToken(t);
          }}
        >
          <label className="field">
            Admin token
            <input className="code-input" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus autoComplete="current-password" />
          </label>
          {error && <p className="side-note error">{error}</p>}
          <button className="btn primary">Open dashboard</button>
          <p className="side-note">This is the ADMIN_TOKEN secret. It's remembered in this browser until you sign out.</p>
        </form>
      </main>
    );
  }

  const rooms = (data?.rooms ?? []).filter((r) => r.name.includes(filter.toLowerCase().trim()));
  const t = data?.totals;
  const used = t ? t.bytes / FREE_STORAGE : 0;

  return (
    <main className="tools admin">
      <div className="tool-top">
        <h1>Admin</h1>
        <button className="btn small" onClick={refresh}>Refresh</button>
        <button
          className="btn small"
          onClick={() => {
            try {
              localStorage.removeItem(KEY);
            } catch {
              // ignore
            }
            setToken("");
            setData(null);
          }}
        >
          Sign out
        </button>
      </div>
      {error && <p className="json-status bad" role="status">✗ {error}</p>}

      {t && (
        <div className="stats">
          <div className="stat"><strong>{t.active}</strong><span>active rooms</span></div>
          <div className="stat"><strong>{t.people}</strong><span>people online</span></div>
          <div className="stat"><strong>{t.rooms}</strong><span>rooms stored</span></div>
          <div className="stat">
            <strong>{size(t.bytes)}</strong>
            <span>of 5 GB free storage ({(used * 100).toFixed(used < 0.01 ? 2 : 1)}%)</span>
            <div className="meter"><div style={{ width: `${Math.min(100, used * 100)}%` }} /></div>
          </div>
        </div>
      )}

      <input className="code-input" type="search" placeholder="Filter rooms" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter rooms" />

      {data && rooms.length === 0 && <p className="side-note">No rooms yet. Rooms appear here once someone edits or joins them.</p>}
      {rooms.length > 0 && (
        <div className="table-wrap">
          <table className="grid-table admin-table">
            <thead>
              <tr>
                <th>Room</th><th>Online</th><th>Size</th><th>Files</th><th>Last edit</th><th>Expires</th><th />
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.name} className={r.people > 0 ? "live" : ""}>
                  <td><a href={`/${r.name}`} target="_blank" rel="noreferrer">/{r.name}</a></td>
                  <td>{r.people > 0 ? <span className="online">● {r.people}</span> : <span className="side-note">0</span>}</td>
                  <td>{size(r.size)}</td>
                  <td>{r.files + r.images > 0 ? `${r.images} img, ${r.files} files` : "–"}</td>
                  <td>{ago(r.lastEdit)}</td>
                  <td>{until(r.expires)}</td>
                  <td className="admin-actions">
                    <button className="btn small" disabled={r.people === 0 || !!busy} onClick={() => act(r, "end")}>End</button>
                    <button className="btn small danger" disabled={!!busy} onClick={() => act(r, "delete")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="side-note">Updates every 10 seconds. Rooms made before the dashboard existed show up the next time they're used.</p>
    </main>
  );
}
