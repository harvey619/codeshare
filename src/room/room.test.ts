import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { readSnapshot, restoreInto } from "./restore";
import { buildHtml } from "../run/buildHtml";
import { parseMarkdown } from "./parseMarkdown";

describe("history restore", () => {
  it("reads old single-file rooms", () => {
    const old = new Y.Doc();
    old.getText("code").insert(0, "print(1)");
    old.getMap("meta").set("language", "Python");
    expect(readSnapshot(Y.encodeStateAsUpdate(old))).toEqual([{ id: "main", name: "main.py", text: "print(1)" }]);
  });

  it("restores files and tabs as one edit", () => {
    const doc = new Y.Doc();
    const snap = new Y.Doc();
    snap.getArray("tabs").push([{ id: "main", name: "index.html" }, { id: "b", name: "style.css" }]);
    snap.getText("code").insert(0, "<h1>hi</h1>");
    snap.getText("file:b").insert(0, "h1{color:red}");
    const files = readSnapshot(Y.encodeStateAsUpdate(snap));

    doc.getArray("tabs").push([{ id: "main", name: "index.html" }, { id: "c", name: "extra.js" }]);
    doc.getText("code").insert(0, "broken");
    doc.getText("file:c").insert(0, "x");
    let updates = 0;
    doc.on("update", () => updates++);
    restoreInto(doc, files);

    expect(updates).toBe(1);
    expect(doc.getArray("tabs").toJSON()).toEqual([{ id: "main", name: "index.html" }, { id: "b", name: "style.css" }]);
    expect(doc.getText("code").toString()).toBe("<h1>hi</h1>");
    expect(doc.getText("file:b").toString()).toBe("h1{color:red}");
    expect(doc.getText("file:c").toString()).toBe("");
  });
});

describe("html preview", () => {
  const files = [
    { name: "style.css", text: "h1 { color: red }" },
    { name: "app.js", text: "console.log('</script> hi')" },
  ];

  it("inlines local css and js and adds console capture", () => {
    const out = buildHtml(
      '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="./app.js"></script><script src="https://cdn.example/x.js"></script></body></html>',
      files,
    );
    expect(out).toContain('<style data-file="style.css">h1 { color: red }</style>');
    expect(out).toContain("console.log('<\\/script> hi')");
    expect(out).toContain('src="https://cdn.example/x.js"');
    expect(out.indexOf("__run")).toBeLessThan(out.indexOf("<style"));
  });

  it("works without a head", () => {
    expect(buildHtml("<p>hi</p>", [])).toMatch(/^<script>.*<p>hi<\/p>$/s);
  });
});

describe("markdown", () => {
  it("parses blocks", () => {
    const blocks = parseMarkdown("# Title\nSome **bold**\ntext.\n\n- a\n- b\n1. one\n```\ncode()\n```");
    expect(blocks.map((b) => b.kind)).toEqual(["h", "p", "ul", "ol", "code"]);
    expect(blocks[1]).toEqual({ kind: "p", text: "Some **bold** text." });
  });
});
