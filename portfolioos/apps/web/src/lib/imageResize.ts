/**
 * Shrink a photo in the browser before it's uploaded: a display copy (long
 * side ≤ 1600px) and a card thumbnail (≤ 480px). Phone photos are 3–8 MB;
 * these come out around 200–400 KB and 30 KB, which is what lets property
 * photos live in the database. EXIF orientation is applied, so portrait shots
 * stay upright, and the re-encode drops the photo's metadata (GPS included).
 */

export const FULL_MAX_PX = 1600;
export const THUMB_MAX_PX = 480;

export interface PreparedImage {
  full: Blob;
  thumb: Blob;
  /** Size of `full`, in pixels. */
  width: number;
  height: number;
}

/** Scale (width, height) down so the long side is at most `max`; never up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(bitmap: ImageBitmap, size: { width: number; height: number }, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  // WebP where the browser can write it (smaller); JPEG otherwise.
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  if (!jpeg) throw new Error('Could not encode the photo');
  return jpeg;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const full = fitWithin(bitmap.width, bitmap.height, FULL_MAX_PX);
    const thumb = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_PX);
    return {
      full: await encode(bitmap, full, 0.82),
      thumb: await encode(bitmap, thumb, 0.78),
      width: full.width,
      height: full.height,
    };
  } finally {
    bitmap.close();
  }
}
