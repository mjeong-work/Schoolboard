-- =============================================================
-- Pre-beta cleanup: strip base64 image data from posts, events, and
-- marketplace_items. All of it pre-dates the Storage-upload migration
-- (20261121000200_post_event_image_storage) and is development/test content — identified solely
-- by the "data:" URI prefix, which is unique to inline base64 payloads
-- (every real upload, from this migration forward, is an
-- https://...supabase.co/storage/... URL, never a data: URI). Nothing
-- matching anything else is touched.
--
-- Only the oversized image payload is removed. Post/listing content,
-- prices, comments, likes, RSVPs, saves, and all other columns are
-- untouched, and no rows are deleted. Full snapshots of every affected
-- row are taken into _backup_20261024_* tables before any UPDATE runs,
-- in the same migration transaction, so this is restorable.
-- =============================================================

-- 1. Backups (idempotent: IF NOT EXISTS so a re-run never overwrites
--    an already-taken snapshot with already-cleaned data) -----------
CREATE TABLE IF NOT EXISTS public._backup_20261024_posts_images AS
SELECT id, author_id, title, image_url, created_at
FROM public.posts
WHERE image_url LIKE 'data:%';

CREATE TABLE IF NOT EXISTS public._backup_20261024_events_images AS
SELECT id, author_id, title, image_url, created_at
FROM public.events
WHERE image_url LIKE 'data:%';

CREATE TABLE IF NOT EXISTS public._backup_20261024_marketplace_items_images AS
SELECT id, seller_id, title, image_url, images, created_at
FROM public.marketplace_items
WHERE image_url LIKE 'data:%'
   OR EXISTS (SELECT 1 FROM unnest(images) AS img WHERE img LIKE 'data:%');

-- Backups live in public, which PostgREST exposes, and CREATE TABLE AS
-- inherits the default anon/authenticated grants with RLS off — the first
-- version of this migration left them readable by anyone holding the
-- public anon key (author/seller ids + titles). Lock them down to the
-- service role / SQL editor. Safe to re-run on a database that already
-- has the tables.
-- The tables already exist where an earlier version of this migration
-- ran (production ran it as 20261024000000). CREATE ... IF NOT EXISTS
-- then copies nothing, so append rows that aren't backed up yet; the
-- UPDATEs below would otherwise null newer images with no copy.
INSERT INTO public._backup_20261024_posts_images (id, author_id, title, image_url, created_at)
SELECT p.id, p.author_id, p.title, p.image_url, p.created_at
FROM public.posts p
WHERE p.image_url LIKE 'data:%'
  AND NOT EXISTS (SELECT 1 FROM public._backup_20261024_posts_images b
                  WHERE b.id = p.id AND b.image_url IS NOT DISTINCT FROM p.image_url);
INSERT INTO public._backup_20261024_events_images (id, author_id, title, image_url, created_at)
SELECT e.id, e.author_id, e.title, e.image_url, e.created_at
FROM public.events e
WHERE e.image_url LIKE 'data:%'
  AND NOT EXISTS (SELECT 1 FROM public._backup_20261024_events_images b
                  WHERE b.id = e.id AND b.image_url IS NOT DISTINCT FROM e.image_url);
INSERT INTO public._backup_20261024_marketplace_items_images (id, seller_id, title, image_url, images, created_at)
SELECT m.id, m.seller_id, m.title, m.image_url, m.images, m.created_at
FROM public.marketplace_items m
WHERE (m.image_url LIKE 'data:%'
       OR EXISTS (SELECT 1 FROM unnest(m.images) AS img WHERE img LIKE 'data:%'))
  AND NOT EXISTS (SELECT 1 FROM public._backup_20261024_marketplace_items_images b
                  WHERE b.id = m.id
                    AND b.image_url IS NOT DISTINCT FROM m.image_url
                    AND b.images IS NOT DISTINCT FROM m.images);

ALTER TABLE public._backup_20261024_posts_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_20261024_events_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_20261024_marketplace_items_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_20261024_posts_images FROM anon, authenticated;
REVOKE ALL ON public._backup_20261024_events_images FROM anon, authenticated;
REVOKE ALL ON public._backup_20261024_marketplace_items_images FROM anon, authenticated;

-- 2. Cleanup ---------------------------------------------------------
UPDATE public.posts
SET image_url = NULL
WHERE image_url LIKE 'data:%';

UPDATE public.events
SET image_url = NULL
WHERE image_url LIKE 'data:%';

-- marketplace_items: strip only the base64 entries from the images[]
-- array (preserving any genuine Storage URL already mixed in), and
-- null image_url only when it was itself a base64 payload.
UPDATE public.marketplace_items
SET
  image_url = CASE WHEN image_url LIKE 'data:%' THEN NULL ELSE image_url END,
  images = COALESCE(
    (SELECT array_agg(img) FROM unnest(images) AS img WHERE img NOT LIKE 'data:%'),
    '{}'
  )
WHERE image_url LIKE 'data:%'
   OR EXISTS (SELECT 1 FROM unnest(images) AS img WHERE img LIKE 'data:%');

-- 3. Report what happened, visible in `supabase db push` output -----
DO $$
DECLARE
  posts_cleaned  INT;
  events_cleaned INT;
  items_cleaned  INT;
BEGIN
  SELECT count(*) INTO posts_cleaned  FROM public._backup_20261024_posts_images;
  SELECT count(*) INTO events_cleaned FROM public._backup_20261024_events_images;
  SELECT count(*) INTO items_cleaned  FROM public._backup_20261024_marketplace_items_images;
  RAISE NOTICE 'base64 cleanup — posts: %, events: %, marketplace_items: %', posts_cleaned, events_cleaned, items_cleaned;
END $$;
