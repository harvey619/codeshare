import { Suspense, useEffect, useMemo, useState } from "react";
import { CATEGORIES, TOOLS, type Category, type Tool } from "./registry";

const FAVS = "tools.favs";
const RECENT = "tools.recent";

function loadList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}
function saveList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // private mode: not remembered
  }
}

export default function ToolsPage() {
  const slug = location.pathname.split("/")[2] ?? "";
  const tool = TOOLS.find((t) => t.slug === slug);

  useEffect(() => {
    document.title = tool ? `${tool.name} · harveys` : "Tools · harveys";
    if (tool) saveList(RECENT, [tool.slug, ...loadList(RECENT).filter((s) => s !== tool.slug)].slice(0, 4));
  }, [tool]);

  if (tool) {
    return (
      <main className={`tools${tool.wide ? " wide" : ""}`}>
        <div className="tool-top">
          <a className="back" href="/tools">← All tools</a>
          <h1><span aria-hidden="true">{tool.icon}</span> {tool.name}</h1>
        </div>
        <Suspense fallback={<p className="tools-loading">Loading…</p>}>
          <tool.Component />
        </Suspense>
      </main>
    );
  }
  return <Index unknown={slug} />;
}

function Index({ unknown }: { unknown: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [favs, setFavs] = useState(() => loadList(FAVS));
  const [recent] = useState(() => loadList(RECENT));

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return TOOLS.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      const hay = `${t.name} ${t.blurb} ${t.keywords} ${t.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query, category]);

  function toggleFav(slug: string) {
    const next = favs.includes(slug) ? favs.filter((s) => s !== slug) : [...favs, slug];
    setFavs(next);
    saveList(FAVS, next);
  }

  const bySlug = (list: string[]) => list.map((s) => TOOLS.find((t) => t.slug === s)).filter((t): t is Tool => !!t);
  const filtering = query !== "" || category !== "All";
  const card = (t: Tool) => <Card key={t.slug} tool={t} fav={favs.includes(t.slug)} onFav={() => toggleFav(t.slug)} />;

  return (
    <main className="tools index">
      <section className="tools-hero">
        <h1>Small tools that just work.</h1>
        <p>{TOOLS.length} free tools for class and code. No sign-up, and your files stay on your device.</p>
        <input
          className="tools-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools: “pdf”, “compress”, “python”…"
          aria-label="Search tools"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length > 0) location.href = `/tools/${shown[0].slug}`;
          }}
        />
        <div className="tools-cats" role="group" aria-label="Category">
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button key={c} className={`cat${category === c ? " active" : ""}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </section>

      {unknown && <p className="side-note error">No tool called “{unknown}”.</p>}

      {!filtering && favs.length > 0 && (
        <section>
          <h2>Your favourites</h2>
          <ul className="tool-list">{bySlug(favs).map(card)}</ul>
        </section>
      )}
      {!filtering && recent.length > 0 && (
        <section>
          <h2>Recently used</h2>
          <ul className="tool-list">{bySlug(recent).map(card)}</ul>
        </section>
      )}

      {filtering ? (
        <section>
          <h2>{shown.length} {shown.length === 1 ? "tool" : "tools"}</h2>
          {shown.length === 0 && <p className="side-note">Nothing matches. Try a different word.</p>}
          <ul className="tool-list">{shown.map(card)}</ul>
        </section>
      ) : (
        CATEGORIES.map((c) => (
          <section key={c}>
            <h2>{c}</h2>
            <ul className="tool-list">{TOOLS.filter((t) => t.category === c).map(card)}</ul>
          </section>
        ))
      )}
    </main>
  );
}

function Card({ tool, fav, onFav }: { tool: Tool; fav: boolean; onFav: () => void }) {
  return (
    <li className="tool-card">
      <a href={`/tools/${tool.slug}`}>
        <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
        <strong>{tool.name}</strong>
        <span className="tool-blurb">{tool.blurb}</span>
      </a>
      <button className={`fav${fav ? " on" : ""}`} onClick={onFav} aria-pressed={fav} aria-label={`${fav ? "Remove" : "Add"} ${tool.name} ${fav ? "from" : "to"} favourites`} title={fav ? "Remove from favourites" : "Add to favourites"}>
        {fav ? "★" : "☆"}
      </button>
    </li>
  );
}
