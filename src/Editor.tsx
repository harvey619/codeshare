import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, Compartment, Annotation } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { java } from "@codemirror/lang-java";
import { LIMITS } from "../shared/limits";
import { connectLww } from "./lww";

const LANGUAGES: Record<string, () => Extension> = {
  JavaScript: () => javascript(),
  Python: () => python(),
  HTML: () => html(),
  CSS: () => css(),
  Java: () => java(),
  "Plain text": () => [],
};

const remote = Annotation.define<boolean>();

const sizeLimit = EditorState.changeFilter.of(
  (tr) => tr.newDoc.length <= LIMITS.docChars,
);

export default function Editor({ room }: { room: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const [lang, setLang] = useState("JavaScript");

  useEffect(() => {
    const sync = connectLww(room, (text) => {
      const v = view.current!;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: text },
        annotations: remote.of(true),
      });
    });

    const sendOnChange = EditorView.updateListener.of((update) => {
      const fromRemote = update.transactions.some((tr) => tr.annotation(remote));
      if (update.docChanged && !fromRemote) {
        sync.sendText(update.state.doc.toString());
      }
    });

    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        extensions: [
          basicSetup,
          sizeLimit,
          sendOnChange,
          language.current.of(LANGUAGES.JavaScript()),
        ],
      }),
    });

    return () => {
      sync.close();
      view.current?.destroy();
    };
  }, [room]);

  function changeLanguage(name: string) {
    setLang(name);
    view.current?.dispatch({
      effects: language.current.reconfigure(LANGUAGES[name]()),
    });
  }

  return (
    <>
      <select value={lang} onChange={(e) => changeLanguage(e.target.value)}>
        {Object.keys(LANGUAGES).map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <div ref={host} className="editor" />
    </>
  );
}