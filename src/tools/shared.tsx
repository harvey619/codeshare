// Small UI pieces shared by the tools.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function CopyButton({ text, label = "Copy", className = "btn small" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={className}
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

type DropProps = {
  accept: string;
  multiple?: boolean;
  title: string;
  hint: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
};

/** Click, drop or paste files. Paste works anywhere on the page while this is mounted. */
export function DropZone({ accept, multiple, title, hint, disabled, onFiles }: DropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        handler.current(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <>
      <button
        className={`bg-drop${over ? " over" : ""}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = [...e.dataTransfer.files];
          if (files.length) onFiles(files);
        }}
      >
        <strong>{title}</strong>
        <span>{hint}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </>
  );
}
