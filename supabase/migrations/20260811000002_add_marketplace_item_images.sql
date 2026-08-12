-- =============================================================
-- Multi-image support for marketplace listings.
--
-- marketplace_items keeps its single `image_url` column (still written
-- on insert as the first/cover photo, for anything that only reads that
-- column), and gains a parallel `images` array holding every photo in
-- display order. images[0] is always the cover/thumbnail image.
-- =============================================================

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';

-- Backfill existing single-image listings into the new array column.
UPDATE public.marketplace_items
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND cardinality(images) = 0;
