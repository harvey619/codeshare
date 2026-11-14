// Builds the page for an HTML preview: the room's other files referenced as
// <link href="style.css"> or <script src="app.js"> are inlined, and a small script
// forwards console output and errors to the editor.

export type RoomFile = { name: string; text: string };

const escapeAttr = (s: string) => s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);

// Stop a file's text from closing the tag it is inlined into.
const safeStyle = (css: string) => css.replace(/<\/style/gi, "<\\/style");
const safeScript = (js: string) => js.replace(/<\/script/gi, "<\\/script");

export const CAPTURE = `<script>(()=>{const send=(stream,args)=>{try{parent.postMessage({__run:1,type:"out",stream,text:args.map(a=>{if(typeof a==="string")return a;if(a instanceof Error)return a.stack||String(a);try{return JSON.stringify(a)}catch{return String(a)}}).join(" ")},"*")}catch{}};for(const [k,s] of [["log","log"],["info","log"],["debug","log"],["warn","warn"],["error","error"]]){const o=console[k];console[k]=(...a)=>{send(s,a);o.apply(console,a)}}addEventListener("error",e=>send("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")]));addEventListener("unhandledrejection",e=>send("error",["Unhandled promise rejection: "+(e.reason&&e.reason.message||e.reason)]))})()</script>`;

export function buildHtml(html: string, files: RoomFile[]): string {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f.text]));
  const local = (ref: string) => byName.get(ref.replace(/^\.\//, "").toLowerCase());

  let out = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    const css = href && local(href);
    return css !== undefined && css !== "" ? `<style data-file="${escapeAttr(href!)}">${safeStyle(css)}</style>` : tag;
  });

  out = out.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before, src, after) => {
    const js = local(src);
    if (js === undefined) return tag;
    const attrs = `${before} ${after}`.replace(/\s+/g, " ").trim();
    return `<script ${attrs} data-file="${escapeAttr(src)}">${safeScript(js)}</script>`.replace("<script  ", "<script ");
  });

  // Capture console output as early as possible.
  if (/<head[^>]*>/i.test(out)) return out.replace(/<head[^>]*>/i, (h) => h + CAPTURE);
  return CAPTURE + out;
}
