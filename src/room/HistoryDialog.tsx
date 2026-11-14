import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { readSnapshot, restoreInto, type SnapshotFile } from "./restore";

type Entry = { id: number; at: number; files: { name: string; chars: number }[] };

export default function HistoryDialog({ room, doc, onClose }: { room: string; doc: Y.Doc; onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState<{ id: number; files: SnapshotFile[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/rooms/${room}/history`;

  useEffect(() => {
    fetch(base)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setError("Couldn't load history"));
  }, [base]);

  async function preview(id: number) {
    setError(null);
    try {
      const res = await fetch(`${base}/${id}`);
      if (!res.ok) throw new Error();
      setOpen({ id, files: readSnapshot(new Uint8Array(await res.arrayBuffer())) });
    } catch {
      setError("Couldn't load that version");
    }
  }

  async function restore() {
    if (!open) return;
    setBusy(true);
    // Save the current state first, so this restore can be undone from the same list.
    await fetch(base, { method: "POST" }).catch(() => {});
    restoreInto(doc, open.files);
    onClose();
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog history" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="History">
        <label>History</label>
        <p className="hint">A copy is saved every 5 minutes while people are editing (last 30 kept).</p>
        {error && <p className="side-note error">{error}</p>}
        {entries === null && !error && <p className="side-note">Loading…</p>}
        {entries?.length === 0 && <p className="side-note">No saved versions yet. The first one appears a few seconds after the first edit.</p>}
        <div className="history-body">
          <ul className="history-list">
            {entries?.map((e) => (
              <li key={e.id}>
                <button className={`history-item${open?.id === e.id ? " active" : ""}`} onClick={() => preview(e.id)}>
                  <strong>{new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</strong>
                  <span>{e.files.map((f) => `${f.name} (${f.chars})`).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <div className="history-preview">
              {open.files.map((f) => (
                <details key={f.id} open={open.files.length === 1}>
                  <summary>{f.name}</summary>
                  <pre>{f.text.slice(0, 4000) || "(empty)"}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={restore} disabled={!open || busy}>Restore this version</button>
        </div>
      </div>
    </div>
  );
}
