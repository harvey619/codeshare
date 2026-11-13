import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";

type Tool = { slug: string; name: string; blurb: string; Component: LazyExoticComponent<ComponentType> };

// Each tool is its own chunk: opening /tools/qr only downloads the QR code.
const TOOLS: Tool[] = [
  {
    slug: "picker",
    name: "Class picker & timer",
    blurb: "Pick a random student (no repeats until everyone's had a go) and run a countdown.",
    Component: lazy(() => import("./PickerTool")),
  },
  {
    slug: "json",
    name: "JSON formatter",
    blurb: "Check, format or minify JSON. Shows exactly where an error is.",
    Component: lazy(() => import("./JsonTool")),
  },
  {
    slug: "diff",
    name: "Diff checker",
    blurb: "Compare two pieces of code or text, line by line with changed words highlighted.",
    Component: lazy(() => import("./DiffTool")),
  },
  {
    slug: "qr",
    name: "QR code",
    blurb: "Turn a link or text into a QR code. Download as PNG or SVG.",
    Component: lazy(() => import("./QrTool")),
  },
  {
    slug: "bg",
    name: "Background remover",
    blurb: "Cut the background out of a photo. Runs in your browser, nothing is uploaded.",
    Component: lazy(() => import("./BgTool")),
  },
];

export default function ToolsPage() {
  const slug = location.pathname.split("/")[2] ?? "";
  const tool = TOOLS.find((t) => t.slug === slug);

  if (tool) {
    return (
      <main className="tools">
        <a className="back" href="/tools">← All tools</a>
        <h1>{tool.name}</h1>
        <Suspense fallback={<p className="tools-loading">Loading…</p>}>
          <tool.Component />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="tools">
      <h1>Tools</h1>
      {slug && <p className="side-note error">No tool called “{slug}”.</p>}
      <ul className="tool-list">
        {TOOLS.map((t) => (
          <li key={t.slug}>
            <a className="tool-card" href={`/tools/${t.slug}`}>
              <strong>{t.name}</strong>
              <span>{t.blurb}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
