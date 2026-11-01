-- =============================================================
-- Backend-side enforcement to match the client-side compression
-- targets, so a bypassed/buggy client can't push oversized or
-- wrong-type files into Storage. Limits are set with headroom above
-- each type's target compressed size (compression is best-effort,
-- not a hard guarantee) rather than at the exact target.
-- =============================================================

UPDATE storage.buckets
SET file_size_limit = 2 * 1024 * 1024, -- target 500KB, headroom to 2MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'post-images';

UPDATE storage.buckets
SET file_size_limit = 2 * 1024 * 1024, -- target 500KB, headroom to 2MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'marketplace-images';

UPDATE storage.buckets
SET file_size_limit = (2.5 * 1024 * 1024)::bigint, -- target 700KB, headroom to 2.5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'event-images';

UPDATE storage.buckets
SET file_size_limit = 1024 * 1024, -- target 150KB, headroom to 1MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'avatars';
