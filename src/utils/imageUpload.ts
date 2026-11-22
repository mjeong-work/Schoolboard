import { supabase, isStagingSchema } from './supabaseClient';
import { compressImage } from './imageCompression';

// Single source of truth for "how do we handle a user-uploaded photo",
// applied consistently everywhere an image is uploaded (posts, events,
// marketplace listings, avatars). Centralizing this means every call site
// gets the same validation, compression target, and Storage bucket — no
// more one dialog accepting 12MB while another accepts 1MB.
export type ImageKind = 'post' | 'event' | 'marketplace' | 'avatar';

interface ImageUploadConfig {
  bucket: string;
  maxOriginalBytes: number;
  targetBytes: number;
  maxDimension: number;
}

export const IMAGE_UPLOAD_CONFIGS: Record<ImageKind, ImageUploadConfig> = {
  post:        { bucket: 'post-images',        maxOriginalBytes: 10 * 1024 * 1024, targetBytes: 500 * 1024, maxDimension: 1600 },
  marketplace: { bucket: 'marketplace-images',  maxOriginalBytes: 10 * 1024 * 1024, targetBytes: 500 * 1024, maxDimension: 1600 },
  event:       { bucket: 'event-images',        maxOriginalBytes: 10 * 1024 * 1024, targetBytes: 700 * 1024, maxDimension: 1920 },
  avatar:      { bucket: 'avatars',             maxOriginalBytes: 5  * 1024 * 1024, targetBytes: 150 * 1024, maxDimension: 512 },
};

const ACCEPTED_INPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export class ImageUploadError extends Error {}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Throws ImageUploadError with a user-facing message if the file fails validation. */
export function validateImageFile(file: File, kind: ImageKind): void {
  const config = IMAGE_UPLOAD_CONFIGS[kind];
  if (!ACCEPTED_INPUT_TYPES.has(file.type)) {
    throw new ImageUploadError(`"${file.name}" isn't a supported image format (use JPEG, PNG, WebP, or GIF).`);
  }
  if (file.size > config.maxOriginalBytes) {
    throw new ImageUploadError(
      `"${file.name}" is ${formatMB(file.size)}MB — the limit is ${formatMB(config.maxOriginalBytes)}MB.`
    );
  }
}

/**
 * Storage buckets are shared with production even on the staging schema,
 * so staging never writes files.
 */
export function assertUploadsAllowed() {
  if (isStagingSchema) {
    throw new ImageUploadError('Photo uploads are turned off in staging (Storage is shared with production).');
  }
}

/**
 * Validate, compress, and upload one image to the bucket for `kind`,
 * returning its public URL. Path is namespaced by `userId` so the
 * existing per-user Storage RLS policies (upload/update/delete only your
 * own objects) apply unchanged.
 */
export async function uploadImage(file: File, kind: ImageKind, userId: string): Promise<string> {
  assertUploadsAllowed();
  validateImageFile(file, kind);
  const config = IMAGE_UPLOAD_CONFIGS[kind];

  const { blob, mimeType, extension } = await compressImage(file, {
    maxDimension: config.maxDimension,
    targetBytes: config.targetBytes,
  });

  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(config.bucket)
    .upload(path, blob, { contentType: mimeType });

  if (uploadError) {
    throw new ImageUploadError(uploadError.message || 'Photo upload failed. Please try again.');
  }

  const { data } = supabase.storage.from(config.bucket).getPublicUrl(path);
  return data.publicUrl;
}
