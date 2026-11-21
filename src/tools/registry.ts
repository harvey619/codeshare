import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type Category = "Teach" | "Code" | "Image" | "Colour" | "Files";
export const CATEGORIES: Category[] = ["Teach", "Code", "Image", "Colour", "Files"];

export type Tool = {
  slug: string;
  name: string;
  blurb: string;
  category: Category;
  icon: string;
  /** Extra words the search box should match. */
  keywords: string;
  /** Use the whole window instead of a centred column. */
  wide?: boolean;
  Component: LazyExoticComponent<ComponentType>;
};

// Each tool is its own chunk: opening one never downloads the others.
export const TOOLS: Tool[] = [
  { slug: "whiteboard", name: "Whiteboard", category: "Teach", icon: "✏️", wide: true,
    blurb: "Sketch diagrams and notes in a friendly hand-drawn style. Great on a projector.",
    keywords: "draw notes diagram excalidraw sketch explain board canvas", Component: lazy(() => import("./WhiteboardTool")) },
  { slug: "python", name: "Python playground", category: "Teach", icon: "🐍", wide: true,
    blurb: "Write and run Python right here. Nothing to install.",
    keywords: "run code interpreter pyodide repl script", Component: lazy(() => import("./PythonTool")) },
  { slug: "picker", name: "Class picker & timer", category: "Teach", icon: "🎲",
    blurb: "Pick a random student (no repeats until everyone's had a go) and run a countdown.",
    keywords: "random name student countdown stopwatch wheel", Component: lazy(() => import("./PickerTool")) },
  { slug: "qr", name: "QR code", category: "Teach", icon: "🔳",
    blurb: "Turn a link or text into a QR code. Download as PNG or SVG.",
    keywords: "link share scan barcode", Component: lazy(() => import("./QrTool")) },

  { slug: "json", name: "JSON formatter", category: "Code", icon: "🧾",
    blurb: "Check, format or minify JSON. Shows exactly where an error is.",
    keywords: "validate pretty print minify lint", Component: lazy(() => import("./JsonTool")) },
  { slug: "diff", name: "Diff checker", category: "Code", icon: "🔀",
    blurb: "Compare two pieces of code or text, with changed words highlighted.",
    keywords: "compare text difference changes", Component: lazy(() => import("./DiffTool")) },
  { slug: "regex", name: "Regex tester", category: "Code", icon: "🔎",
    blurb: "Try a regular expression against sample text and see every match and group.",
    keywords: "regular expression pattern match test", Component: lazy(() => import("./RegexTool")) },
  { slug: "encode", name: "Encode & decode", category: "Code", icon: "🔤",
    blurb: "Base64, URL and HTML encoding both ways, plus a JWT decoder.",
    keywords: "base64 url uri html entities jwt token decode", Component: lazy(() => import("./EncodeTool")) },
  { slug: "generate", name: "IDs, passwords & hashes", category: "Code", icon: "🔑",
    blurb: "Generate UUIDs and strong passwords, or hash text with SHA-256.",
    keywords: "uuid guid password random hash sha checksum", Component: lazy(() => import("./GenerateTool")) },
  { slug: "time", name: "Timestamp converter", category: "Code", icon: "🕒",
    blurb: "Convert Unix timestamps to dates and back, in your time zone and UTC.",
    keywords: "unix epoch date time iso utc", Component: lazy(() => import("./TimeTool")) },
  { slug: "markdown", name: "Markdown to PDF", category: "Code", icon: "📝",
    blurb: "Write Markdown, see it formatted live, and save it as a PDF.",
    keywords: "md preview document doc pdf print notes export", Component: lazy(() => import("./MarkdownTool")) },

  { slug: "image", name: "Image compressor & converter", category: "Image", icon: "🗜️",
    blurb: "Shrink images or convert between PNG, JPEG and WebP. Several at once.",
    keywords: "compress convert webp png jpg jpeg optimize size", Component: lazy(() => import("./ImageTool")) },
  { slug: "crop", name: "Resize & crop", category: "Image", icon: "✂️",
    blurb: "Resize by pixels or percent and crop to a shape like square or 16:9.",
    keywords: "resize crop scale dimensions aspect ratio", Component: lazy(() => import("./CropTool")) },
  { slug: "bg", name: "Background remover", category: "Image", icon: "🪄",
    blurb: "Cut the background out of a photo. Runs in your browser, nothing is uploaded.",
    keywords: "remove background transparent cutout png", Component: lazy(() => import("./BgTool")) },

  { slug: "colour", name: "Colour picker & contrast", category: "Colour", icon: "🎨",
    blurb: "Pick a colour, get HEX/RGB/HSL, check text contrast and build a palette.",
    keywords: "color hex rgb hsl eyedropper contrast wcag palette shades", Component: lazy(() => import("./ColourTool")) },

  { slug: "pdf", name: "PDF tools", category: "Files", icon: "📄",
    blurb: "Merge PDFs, pull out pages, or turn images into one PDF.",
    keywords: "merge split combine extract pages images to pdf join", Component: lazy(() => import("./PdfTool")) },
];
