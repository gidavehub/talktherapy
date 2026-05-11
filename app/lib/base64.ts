/**
 * Helpers for storing user media (profile photos, attachments) as base64
 * strings in Firestore — we have no Storage budget on the free tier.
 *
 * Hard limits:
 *  - Firestore document size cap = ~1 MiB. We resize/compress aggressively
 *    so the encoded string stays well under that ceiling.
 *  - We refuse anything larger than MAX_BYTES_AFTER_ENCODE post-encoding.
 */

export const MAX_BYTES_AFTER_ENCODE = 700 * 1024; // 700 KB ceiling
export const PROFILE_MAX_DIMENSION = 512;
export const PROFILE_QUALITY = 0.82;

export type EncodeOptions = {
  maxDimension?: number;
  quality?: number;
  mime?: "image/jpeg" | "image/webp";
};

/**
 * Encode a File (from <input type=file>) to a compressed base64 data URL,
 * resizing so the longest side fits inside `maxDimension`.
 */
export async function fileToCompressedDataUrl(
  file: File,
  options: EncodeOptions = {},
): Promise<string> {
  const {
    maxDimension = PROFILE_MAX_DIMENSION,
    quality = PROFILE_QUALITY,
    mime = "image/jpeg",
  } = options;

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const dataUrl = canvas.toDataURL(mime, quality);
  if (estimateBytes(dataUrl) > MAX_BYTES_AFTER_ENCODE) {
    // Re-encode at a lower quality once before giving up.
    const retry = canvas.toDataURL(mime, Math.max(0.5, quality - 0.18));
    if (estimateBytes(retry) > MAX_BYTES_AFTER_ENCODE) {
      throw new Error("Image is too large even after compression.");
    }
    return retry;
  }
  return dataUrl;
}

/** Rough byte size of a base64 string (4 chars ≈ 3 bytes). */
export function estimateBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

/** Strip the data: prefix — useful when you want the raw base64. */
export function dataUrlToRawBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/** Wrap a raw base64 string back into a data URL. */
export function rawBase64ToDataUrl(base64: string, mime = "image/jpeg"): string {
  return `data:${mime};base64,${base64}`;
}
