export type ImageMeta = { id: string; name: string; w: number; h: number; size: number; addedAt: number };

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function isAcceptedImage(file: File) {
  return ACCEPTED.includes(file.type);
}

function toWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/webp", quality),
  );
}

export async function compressImage(file: File, maxBytes: number) {
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;

  const longest = Math.max(width, height);
  if (longest > 2560) {
    width = Math.round((width * 2560) / longest);
    height = Math.round((height * 2560) / longest);
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await toWebp(canvas, quality);
      if (blob.size <= maxBytes) return { blob, w: width, h: height };
    }
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
  }
  throw new Error("Image is too large even after compressing");
}

export async function uploadImage(room: string, blob: Blob): Promise<string> {
  const res = await fetch(`/api/rooms/${room}/images`, { method: "POST", body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data.id;
}