import { useRef, useState } from "react";
import { formatSize, type FileMeta, type ImageMeta } from "./images";

type Props = {
  room: string;
  images: ImageMeta[];
  files: FileMeta[];
  error: string | null;
  busy: boolean;
  onPick: (list: File[]) => void;
};

export default function Sidebar({ room, images, files, error, busy, onPick }: Props) {
  const [open, setOpen] = useState<ImageMeta | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const src = (img: ImageMeta) => `/api/rooms/${room}/images/${img.id}`;
  const empty = images.length === 0 && files.length === 0;

  return (
    <aside className="sidebar">
      <button className="btn small" onClick={() => input.current?.click()} disabled={busy}>
        + Add files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onPick([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {busy && <p className="side-note">Uploading…</p>}
      {error && <p className="side-note error">{error}</p>}
      {empty && !busy && <p className="side-note">Paste, drop or add images and files</p>}

      {images.length > 0 && (
        <section>
          <div className="side-head">
            Images <span className="count">{images.length}</span>
          </div>
          <ul className="thumbs">
            {images.map((img) => (
              <li key={img.id}>
                <button className="thumb" onClick={() => setOpen(img)} title={img.name}>
                  <img src={src(img)} alt={img.name} loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {files.length > 0 && (
        <section>
          <div className="side-head">
            Files <span className="count">{files.length}</span>
          </div>
          <ul className="files">
            {files.map((f) => (
              <li key={f.id}>
                <a className="file" href={`/api/rooms/${room}/files/${f.id}`} download={f.name} title={f.name}>
                  <span className="file-name">{f.name}</span>
                  <span className="file-size">{formatSize(f.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={src(open)} alt={open.name} />
        </div>
      )}
    </aside>
  );
}
