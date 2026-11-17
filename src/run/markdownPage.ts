// The page shown when you "Run" a Markdown file: the notes, formatted and readable on a projector.
// Loaded only when used, so rooms don't download the Markdown library up front.
import { marked } from "marked";
import DOMPurify from "dompurify";

const STYLE = `
body { margin: 0; padding: 28px 36px; font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1e24; background: #fff; max-width: 860px; }
h1, h2, h3 { line-height: 1.25; margin: 1.2em 0 0.5em; } h1 { font-size: 2em; margin-top: 0; } h2 { font-size: 1.5em; }
code { font: 0.9em ui-monospace, "SF Mono", Menlo, monospace; background: #f1f2f5; padding: 1px 5px; border-radius: 4px; }
pre { background: #f6f7f9; border: 1px solid #e3e5ea; padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { margin: 1em 0; padding: 6px 16px; background: #f4f1ff; border-radius: 8px; color: #444; }
table { border-collapse: collapse; } th, td { border: 1px solid #d8dbe2; padding: 6px 10px; text-align: left; }
img { max-width: 100%; } a { color: #6a4cf0; }
`;

export function markdownPage(text: string) {
  const body = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }));
  return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>${body}`;
}
