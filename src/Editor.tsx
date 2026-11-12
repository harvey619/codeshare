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

export default function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const [lang, setLang] = useState("JavaScript");

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        extensions: [basicSetup, sizeLimit, language.current.of(LANGUAGES.JavaScript())],
      }),
    });
    return () => view.current?.destroy();
  }, []);

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