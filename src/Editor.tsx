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
import { LIMITS } from "../shared/limits";

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

export default function Editor({ room }: { room: string }) {
  const host = useRef<HTMLDivElement>(null);
  const language = useRef(new Compartment());
  const meta = useRef<Y.Map<string> | null>(null);
  const [lang, setLang] = useState("JavaScript");
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const doc = new Y.Doc();
    const ytext = doc.getText("code");
    const ymeta = doc.getMap<string>("meta");
    meta.current = ymeta;

    const provider = new YProvider(location.host, room, doc, { party: "room" });

    provider.on("status", ({ status }: { status: string }) => {
      setStatus(status === "connected" ? "live" : status === "connecting" ? "connecting" : "offline");
    });

    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          sizeLimit,
          language.current.of(LANGUAGES.JavaScript()),
          yCollab(ytext, provider.awareness),
        ],
      }),
    });

    const applyLanguage = () => {
      const name = ymeta.get("language") ?? "JavaScript";
      if (!LANGUAGES[name]) return;
      setLang(name);
      view.dispatch({ effects: language.current.reconfigure(LANGUAGES[name]()) });
    };
    ymeta.observe(applyLanguage);

    return () => {
      ymeta.unobserve(applyLanguage);
      view.destroy();
      provider.destroy();
      doc.destroy();
    };
  }, [room]);

  return (
    <>
      <div className="toolbar">
        <select value={lang} onChange={(e) => meta.current?.set("language", e.target.value)}>
          {Object.keys(LANGUAGES).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <span className={`status ${status}`}>{status}</span>
      </div>
      <div ref={host} className="editor" />
    </>
  );
}