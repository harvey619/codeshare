import { useState } from "react";
import type { ImageMeta } from "./images";

type Props = { room: string; images: ImageMeta[]; error: string | null; busy: boolean };

export default function ImageStrip({ room, images, error, busy }: Props) {
  const [open, setOpen] = useState<ImageMeta | null>(null);
  const src = (img: ImageMeta) => `/api/rooms/${room}/images/${img.id}`;

  return (
    <aside className="strip">
      <div className="strip-head">
        Images <span className="count">{images.length}</span>
      </div>
      {busy && <p className="strip-note">Uploading…</p>}
      {error && <p className="strip-note error">{error}</p>}
      {images.length === 0 && !busy && <p className="strip-note">Paste or drop an image</p>}
      <ul className="thumbs">
        {images.map((img) => (
          <li key={img.id}>
            <button className="thumb" onClick={() => setOpen(img)} title={img.name}>
              <img src={src(img)} alt={img.name} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={src(open)} alt={open.name} />
        </div>
      )}
    </aside>
  );
}