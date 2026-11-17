// The multi-file model shared by the Worker and the browser.
// A room's Y.Doc holds:
//   Y.Array "tabs"  of FileTab, in display order
//   Y.Text  "code"  for the first file (id "main"), kept from before rooms had several files
//   Y.Text  "file:<id>" for every other file

export type FileTab = { id: string; name: string };

export const MAIN_ID = "main";
export const MAX_TABS = 10;

export const textKey = (id: string) => (id === MAIN_ID ? "code" : `file:${id}`);

export type Language = "Markdown" | "JavaScript" | "TypeScript" | "Python" | "HTML" | "CSS" | "Java" | "Plain text";

const BY_EXT: Record<string, Language> = {
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript",
  py: "Python",
  html: "HTML", htm: "HTML",
  css: "CSS",
  java: "Java",
  md: "Markdown", markdown: "Markdown",
};

export const EXT_FOR: Record<Language, string> = {
  Markdown: "md", JavaScript: "js", TypeScript: "ts", Python: "py", HTML: "html", CSS: "css", Java: "java", "Plain text": "txt",
};

export const LANGUAGES = Object.keys(EXT_FOR) as Language[];

export function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function languageOf(name: string): Language {
  return BY_EXT[extensionOf(name)] ?? "Plain text";
}

/** Swap a file's extension for the given language: main.js + Python -> main.py */
export function withLanguage(name: string, lang: Language) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${EXT_FOR[lang]}`;
}

/** The first file of a brand-new room: notes, which Run shows formatted. */
export const NEW_ROOM_FILE = "notes.md";

/** First file's name for a room made before multi-file support, from its old language setting. */
export function legacyMainName(language: string | undefined) {
  if (language === "HTML") return "index.html";
  if (language === "CSS") return "style.css";
  if (language === "Java") return "Main.java";
  const lang = (LANGUAGES as string[]).includes(language ?? "") ? (language as Language) : "JavaScript";
  return withLanguage("main", lang);
}

/** Safe, short file names: letters, digits, dot, dash, underscore. Null if nothing usable. */
export function cleanFileName(raw: string): string | null {
  const name = raw.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 40);
  return name ? name : null;
}

/** Tabs without duplicates (two people creating the first tab at once can both push it). */
export function dedupeTabs(tabs: FileTab[]): FileTab[] {
  const seen = new Set<string>();
  return tabs.filter((t) => t && typeof t.id === "string" && !seen.has(t.id) && seen.add(t.id));
}
