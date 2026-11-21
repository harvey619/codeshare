import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { isLive, normalizeSlug, type ShortLink } from "../../shared/links";

// The admin's short links: harveycodes.com/go/<name> → a long link. Add, edit, delete, copy, QR.

type Api = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type Draft = { slug: string; url: string; note: string; expires: string };
const EMPTY: Draft = { slug: "", url: "", note: "", expires: "" };

const short = (slug: string) => `${location.host}/go/${slug}`;
const toDateInput = (t: number | null) => {
  if (!t) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function ago(t: number | null) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export default function LinksPanel({ api, tick, onError }: { api: Api; tick: number; onError: (msg: string) => void }) {
  const [links, setLinks] = useState<ShortLink[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<{ slug: string; src: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks(((await api("links")) as { links: ShortLink[] }).links);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't load short links");
    }
  }, [api, onError]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load, tick]);

  useEffect(() => {
    if (!qr) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setQr(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [qr]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api("links", "POST", {
        slug: draft.slug,
        url: draft.url,
        note: draft.note,
        expires: draft.expires ? new Date(`${draft.expires}T23:59:59`).getTime() : null,
        from: editing,
      });
      setDraft(EMPTY);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save the link");
    }
    setSaving(false);
  }

  async function remove(l: ShortLink) {
    if (!confirm(`Delete /go/${l.slug}? Anyone using it will see "Link not found".`)) return;
    try {
      await api(`links/${l.slug}`, "DELETE");
      if (editing === l.slug) {
        setEditing(null);
        setDraft(EMPTY);
      }
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't delete the link");
    }
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(`https://${short(slug)}`);
      setCopied(slug);
      setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1200);
    } catch {
      // clipboard blocked: the link is still on screen
    }
  }

  async function showQr(slug: string) {
    const src = await QRCode.toDataURL(`https://${short(slug)}`, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    setQr({ slug, src });
  }

  const preview = normalizeSlug(draft.slug);

  return (
    <section className="links-panel" aria-label="Short links">
      <h2>Short links</h2>
      <form className="card link-form" onSubmit={save}>
        <div className="link-form-row">
          <label className="field">
            Short name
            <span className="link-name">
              <span className="link-prefix">{location.host}/go/</span>
              <input className="code-input" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="drive" required maxLength={60} />
            </span>
          </label>
          <label className="field link-url">
            Long link
            <input className="code-input" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://drive.google.com/…" required />
          </label>
        </div>
        <div className="link-form-row">
          <label className="field link-note">
            Note (optional)
            <input className="code-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Year 8 worksheet folder" maxLength={200} />
          </label>
          <label className="field">
            Stops working after (optional)
            <input className="code-input" type="date" value={draft.expires} onChange={(e) => setDraft({ ...draft, expires: e.target.value })} />
          </label>
        </div>
        {preview && draft.slug !== preview && <p className="side-note">It will be /go/{preview}</p>}
        {formError && <p className="side-note error" role="alert">{formError}</p>}
        <div className="link-form-row">
          <button className="btn primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add link"}</button>
          {editing && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(null);
                setDraft(EMPTY);
                setFormError(null);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {links && links.length === 0 && <p className="side-note">No short links yet. Add one above.</p>}
      {links && links.length > 0 && (
        <div className="table-wrap">
          <table className="grid-table admin-table links-table">
            <thead>
              <tr>
                <th>Short link</th><th>Goes to</th><th>Opens</th><th>Last opened</th><th>Expires</th><th />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.slug} className={isLive(l) ? "" : "expired"}>
                  <td>
                    <div className="link-cell">
                      <a href={`/go/${l.slug}`} target="_blank" rel="noreferrer">/go/{l.slug}</a>
                      <button className="py-copy" onClick={() => copy(l.slug)} aria-label={`Copy /go/${l.slug}`}>{copied === l.slug ? "Copied ✓" : "Copy"}</button>
                    </div>
                    {l.note && <div className="side-note">{l.note}</div>}
                  </td>
                  <td className="link-target" title={l.url}>{l.url.replace(/^https?:\/\//, "")}</td>
                  <td>{l.clicks}</td>
                  <td>{ago(l.lastClick)}</td>
                  <td>{l.expires === null ? "never" : isLive(l) ? new Date(l.expires).toLocaleDateString() : <span className="expired-tag">expired</span>}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="btn small" onClick={() => showQr(l.slug)}>QR</button>
                      <button
                        className="btn small"
                        onClick={() => {
                          setEditing(l.slug);
                          setDraft({ slug: l.slug, url: l.url, note: l.note, expires: toDateInput(l.expires) });
                          setFormError(null);
                          document.querySelector(".link-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        Edit
                      </button>
                      <button className="btn small danger" onClick={() => remove(l)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {qr && (
        <div className="qr-overlay" onClick={() => setQr(null)}>
          <div className="qr-box card" role="dialog" aria-modal="true" aria-label={`QR code for /go/${qr.slug}`} onClick={(e) => e.stopPropagation()}>
            <img src={qr.src} alt={`QR code for ${short(qr.slug)}`} />
            <strong className="qr-text">{short(qr.slug)}</strong>
            <div className="link-form-row">
              <a className="btn" href={qr.src} download={`go-${qr.slug}.png`}>Download PNG</a>
              <button className="btn primary" onClick={() => setQr(null)} autoFocus>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
