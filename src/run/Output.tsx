import { useEffect, useRef, useState } from "react";
import type { OutLine } from "./runner";

type Props = {
  lines: OutLine[];
  status: string | null;
  /** Set while the program is paused in input(). */
  waiting: { prompt: string } | null;
  onAnswer: (text: string) => void;
  empty: string;
};

/** Program output, with an inline box to type into when the program asks for input. */
export default function Output({ lines, status, waiting, onAnswer, empty }: Props) {
  const [value, setValue] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, status, waiting]);
  useEffect(() => {
    if (waiting) box.current?.focus({ preventScroll: true });
  }, [waiting]);

  return (
    <>
      {lines.map((l, i) => (
        <pre key={i} className={`out ${l.stream}`}>{l.text}</pre>
      ))}
      {waiting && (
        <form
          className="out ask"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(value);
            setValue("");
          }}
        >
          <span>{waiting.prompt}</span>
          <input ref={box} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Program input" autoComplete="off" spellCheck={false} />
          <span className="ask-hint">Enter ↵</span>
        </form>
      )}
      {status && !waiting && <p className="side-note">{status}</p>}
      {lines.length === 0 && !status && !waiting && empty && <p className="side-note">{empty}</p>}
      <div ref={end} />
    </>
  );
}
