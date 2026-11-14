import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { CopyButton } from "./shared";
import { useStored } from "./util";

const SAMPLE = `# Lesson 3: Loops

A **loop** repeats code. Use one when you'd otherwise copy and paste.

## Example

\`\`\`python
for i in range(3):
    print("Hello", i)
\`\`\`

## Remember

1. \`range(3)\` gives 0, 1, 2
2. Indent the lines you want repeated

| Loop | Use it when |
|------|-------------|
| for | you know how many times |
| while | you repeat until something changes |

> Tip: read the loop out loud, "for each i in…"
`;

export default function MarkdownTool() {
  const [text, setText] = useStored("tools.markdown", SAMPLE);
  // Sanitised, so pasted Markdown can't smuggle in scripts.
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true })), [text]);

  return (
    <div className="stack md">
      <div className="json-bar no-print">
        <button className="btn primary" onClick={() => window.print()}>Save as PDF</button>
        <CopyButton text={html} label="Copy HTML" className="btn" />
        <button className="btn" onClick={() => confirm("Replace your text with the example?") && setText(SAMPLE)}>Example</button>
        <span className="side-note">“Save as PDF” opens your browser's print window: choose “Save as PDF” as the printer.</span>
      </div>
      <div className="md-split">
        <textarea className="code-area no-print" value={text} onChange={(e) => setText(e.target.value)} spellCheck aria-label="Markdown" />
        <article className="md-preview" aria-label="Preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
