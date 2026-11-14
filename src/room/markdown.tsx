// A tiny Markdown renderer for AI explanations: paragraphs, headings, bullet and numbered
// lists, code blocks, `inline code` and **bold**. It builds React elements, so nothing the
// model writes is ever treated as HTML.
import type { ReactNode } from "react";

import { parseMarkdown } from "./parseMarkdown";

function inline(text: string): ReactNode[] {
  // Split into `code`, **bold** and plain runs.
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {parseMarkdown(text).map((b, i) => {
        if (b.kind === "code") return <pre key={i}><code>{b.text}</code></pre>;
        if (b.kind === "h") return <h4 key={i}>{inline(b.text)}</h4>;
        if ("items" in b) {
          const items = b.items.map((t, j) => <li key={j}>{inline(t)}</li>);
          return b.kind === "ul" ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
        }
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </>
  );
}
