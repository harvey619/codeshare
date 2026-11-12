import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { java } from "@codemirror/lang-java";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import { yCollab } from "y-codemirror.next";
import { oneDark } from "@codemirror/theme-one-dark";
import { LIMITS } from "../shared/limits";
import { getLocalUser, saveLocalUser, type User } from "./presence";
import { compressImage, isAcceptedImage, uploadImage, type ImageMeta } from "./images";
import ImageStrip from "./ImageStrip";

const LANGUAGES: Record<string, () => Extension> = {
  JavaScript: () => javascript(),
  Python: () => python(),
  HTML: () => html(),
  CSS: () => css(),
  Java: () => java(),
  "Plain text": () => [],
};

const sizeLimit = EditorState.changeFilter.of(
  (tr) => tr.newDoc.length <= LIMITS.docChars,
);

type Status = "connecting" | "live" | "offline";
const CLOSE_REASONS: Record<number, string> = {
  1008: "You were sending too fast. Reconnecting…",
  1009: "That change was too large to send.",
  1013: "This room is full (50 people max).",
  4000: "This room expired after 24h without edits.",
};

export default function Editor({ room, dark }: { room: string; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const language = useRef(new Compartment());
  const theme = useRef(new Compartment());
  const view = useRef<EditorView | null>(null);
  const [lang, setLang] = useState("JavaScript");
  const [status, setStatus] = useState<Status>("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const [me, setMe] = useState(getLocalUser);
  const [others, setOthers] = useState<User[]>([]);
  const awareness = useRef<YProvider["awareness"] | null>(null);
  const meta = useRef<Y.Map<string> | null>(null);
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const ytext = doc.getText("code");
    const ymeta = doc.getMap<string>("meta");
    meta.current = ymeta;

    const provider = new YProvider(location.host, room, doc, { party: "room" });

    awareness.current = provider.awareness;
    provider.awareness.setLocalStateField("user", { ...getLocalUser(), colorLight: getLocalUser().color + "33" });

    const updateOthers = () => {
      const users: User[] = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== provider.awareness.clientID && state.user) users.push(state.user);
      });
      setOthers(users);
    };
    provider.awareness.on("change", updateOthers);

    provider.on("status", ({ status }: { status: string }) => {
      setStatus(status === "connected" ? "live" : status === "connecting" ? "connecting" : "offline");
    });
    
    provider.on("connection-close", (event: CloseEvent | null) => {
      const reason = event && CLOSE_REASONS[event.code];
      if (reason) setNotice(reason);
    });

    provider.on("custom-message", (message: string) => {
      if (message === "too-large") setNotice("This room is too large to save. Delete some content.");
    });

    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          sizeLimit,
          language.current.of(LANGUAGES.JavaScript()),
          theme.current.of(dark ? oneDark : []),
          yCollab(ytext, provider.awareness),
        ],
      }),
    });

    view.current = editor;

    const applyLanguage = () => {
      const name = ymeta.get("language") ?? "JavaScript";
      if (!LANGUAGES[name]) return;
      setLang(name);
      editor.dispatch({ effects: language.current.reconfigure(LANGUAGES[name]()) });
    };
    ymeta.observe(applyLanguage);

    const yimages = doc.getArray<ImageMeta>("images");
    const updateImages = () => setImages(yimages.toArray());
    yimages.observe(updateImages);

    async function addImage(file: File) {
      setImageError(null);
      setUploading(true);
      try {
        const { blob, w, h } = await compressImage(file, LIMITS.imageBytes);
        const id = await uploadImage(room, blob);
        yimages.push([{ id, name: file.name || "pasted image", w, h, size: blob.size, addedAt: Date.now() }]);
      } catch (err) {
        setImageError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    }

    const imageFrom = (files: FileList | undefined) => [...(files ?? [])].find(isAcceptedImage);

    const onPaste = (e: ClipboardEvent) => {
      const file = imageFrom(e.clipboardData?.files);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      addImage(file);
    };
    const onDrop = (e: DragEvent) => {
      const file = imageFrom(e.dataTransfer?.files);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      addImage(file);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();

    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragover", onDragOver);

    return () => {
      ymeta.unobserve(applyLanguage);
      yimages.unobserve(updateImages);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragover", onDragOver);
      provider.awareness.off("change", updateOthers);
      editor.destroy();
      provider.destroy();
      doc.destroy();
    };
  }, [room]);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) });
  }, [dark]);

  function rename() {
    const name = prompt("Your name", me.name)?.trim().slice(0, 30);
    if (!name) return;
    const user = { ...me, name };
    saveLocalUser(user);
    setMe(user);
    awareness.current?.setLocalStateField("user", { ...user, colorLight: user.color + "33" });
  }

  return (
    <>
      <div className="toolbar">
        <select value={lang} onChange={(e) => meta.current?.set("language", e.target.value)}>
          {Object.keys(LANGUAGES).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <span className={`status ${status}`}>{status}</span>
        {notice && (
          <button className="notice" onClick={() => setNotice(null)} title="Dismiss">
            {notice} ✕
          </button>
        )}        
        <ul className="people">
          <li>
            <button className="person" onClick={rename} title="Rename yourself">
              <span className="dot" style={{ background: me.color }} />
              {me.name} (you)
            </button>
          </li>
          {others.map((u, i) => (
            <li key={i} className="person">
              <span className="dot" style={{ background: u.color }} />
              {u.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="workspace">
        <div ref={host} className="editor" />
        <ImageStrip room={room} images={images} error={imageError} busy={uploading} />
      </div>
    </>
  );
}