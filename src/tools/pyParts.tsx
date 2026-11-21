import { useEffect, useRef, useState } from "react";
import { PY_EXAMPLES } from "./pyExamples";
import { CHEAT_SHEET } from "./pyCheatsheet";

const GROUPS = [...new Set(PY_EXAMPLES.map((e) => e.group))];

/** The Examples button and its pop-up list of example programs, grouped, with an icon and a line about each. */
export function ExamplesMenu({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>(".py-menu-btn")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLButtonElement>(".py-example")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="py-menu" ref={box}>
      <button className={`btn py-menu-btn${open ? " active" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>📚</span> Examples <span className="caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="py-menu-panel" role="group" aria-label="Examples">
          {GROUPS.map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              <div className="py-example-grid">
                {PY_EXAMPLES.filter((e) => e.group === g).map((e) => (
                  <button
                    key={e.id}
                    className="py-example"
                    onClick={() => {
                      setOpen(false);
                      onPick(e.id);
                    }}
                  >
                    <span className="py-example-icon" aria-hidden>{e.icon}</span>
                    <span className="py-example-text">
                      <strong>{e.name}</strong>
                      <small>{e.blurb}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Reminders for Python and turtle, with a Copy button on each snippet. */
export function CheatSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(CHEAT_SHEET[0].id);
  const [copied, setCopied] = useState<string | null>(null);
  const current = CHEAT_SHEET.find((t) => t.id === tab)!;

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1200);
    } catch {
      // clipboard blocked: the snippet can still be selected by hand
    }
  }

  return (
    <aside className="py-cheat" aria-label="Cheat sheet">
      <div className="py-cheat-head">
        <div className="py-cheat-tabs" role="tablist">
          {CHEAT_SHEET.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === tab} className={`panel-tab${t.id === tab ? " active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="tab-x" onClick={onClose} title="Close cheat sheet" aria-label="Close cheat sheet">✕</button>
      </div>
      <div className="py-cheat-body" role="tabpanel">
        {current.sections.map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            {s.items.map((item) => (
              <div key={item.code} className="py-cheat-item">
                <div className="py-cheat-note">
                  <span>{item.note}</span>
                  <button className="py-copy" onClick={() => copy(item.code)}>{copied === item.code ? "Copied ✓" : "Copy"}</button>
                </div>
                <pre>{item.code}</pre>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

/** The bar between code and output: drag it, or focus it and use the arrow keys. Double-click resets. */
export function SplitHandle({ ratio, onChange, container }: { ratio: number; onChange: (r: number) => void; container: React.RefObject<HTMLDivElement | null> }) {
  const clamp = (r: number) => Math.min(0.8, Math.max(0.2, r));
  return (
    <div
      className="py-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize code and output"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onDoubleClick={() => onChange(0.5)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clamp(ratio - 0.05));
        else if (e.key === "ArrowRight") onChange(clamp(ratio + 0.05));
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        const el = container.current;
        if (!el || e.button !== 0) return;
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const left = el.querySelector(".py-left")!.getBoundingClientRect().left;
        const right = el.querySelector(".py-right")!.getBoundingClientRect().right;
        document.body.classList.add("py-resizing");
        const move = (ev: PointerEvent) => onChange(clamp((ev.clientX - left) / (right - left)));
        const up = () => {
          document.body.classList.remove("py-resizing");
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      }}
    >
      <span aria-hidden />
    </div>
  );
}
