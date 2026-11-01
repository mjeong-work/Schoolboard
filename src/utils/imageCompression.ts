// Client-side image downscale/re-encode, shared by everything that uploads
// user photos to Supabase Storage (avatars, posts, events, marketplace
// listings). Keeps full-resolution phone-camera photos from ever being
// held in memory or uploaded as-is — everything is resized to a max
// dimension, re-encoded as WebP (falling back to JPEG where WebP isn't
// supported), and iteratively quality-reduced toward a target byte size
// before it touches the network.

export interface CompressedImage {
  blob: Blob;
  mimeType: string;
  /** File extension (no dot) matching mimeType, for building the storage path. */
  extension: string;
}

let webpSupport: Promise<boolean> | null = null;

// Some browsers accept 'image/webp' in canvas.toBlob() without error but
// silently hand back a PNG — so detect support by checking the actual
// mime type of a tiny real encode, once, and cache the result.
function canEncodeWebP(): Promise<boolean> {
  if (!webpSupport) {
    webpSupport = new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(blob?.type === 'image/webp'), 'image/webp');
    });
  }
  return webpSupport;
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
      mimeType,
      quality
    );
  });
}

export interface CompressOptions {
  /** Longest edge, in pixels; aspect ratio is always preserved. */
  maxDimension: number;
  /** Best-effort output size — quality is stepped down to try to hit this, but a floor quality wins if it still can't. */
  targetBytes: number;
  /** Quality floor so compression never degrades the image past usefulness just to hit targetBytes. Default 0.4. */
  minQuality?: number;
}

/**
 * Resize `file` to fit within `maxDimension` and re-encode (WebP when the
 * browser supports it, else JPEG), binary-searching quality to land at or
 * under `targetBytes`. Always returns a result — if even the quality floor
 * can't reach the target, the smallest attempt found is returned rather
 * than failing the upload.
 */
export async function compressImage(file: File | Blob, options: CompressOptions): Promise<CompressedImage> {
  const { maxDimension, targetBytes, minQuality = 0.4 } = options;

  const img = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const useWebP = await canEncodeWebP();
  const mimeType = useWebP ? 'image/webp' : 'image/jpeg';
  const extension = useWebP ? 'webp' : 'jpg';

  // Binary search quality in [minQuality, 0.92] for the smallest blob
  // that's still <= targetBytes; keep the best (smallest-over-target)
  // attempt seen in case the floor still doesn't make it.
  let lo = minQuality;
  let hi = 0.92;
  let best: Blob | null = null;
  let smallestSeen: Blob | null = null;

  for (let i = 0; i < 6; i++) {
    const quality = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!smallestSeen || blob.size < smallestSeen.size) smallestSeen = blob;

    if (blob.size <= targetBytes) {
      best = blob;
      lo = quality; // try to use more of the quality budget
    } else {
      hi = quality;
    }
  }

  const finalBlob = best ?? smallestSeen!;
  return { blob: finalBlob, mimeType, extension };
}
