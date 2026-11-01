-- =============================================================
-- Performance audit follow-up: posts and events were still writing
-- raw base64 image data straight into the posts.image_url /
-- events.image_url TEXT columns (the exact problem the marketplace
-- bucket migration already fixed for listing photos). Every feed/
-- events load — and every single refetch after a like, comment, or
-- RSVP — was shipping that base64 blob back down for every row with
-- a photo, which is a direct cause of slow post/feed load times.
--
-- This mirrors the marketplace-images bucket pattern exactly:
-- photos move to Storage, the DB column just holds the public URL.
-- =============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own post images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read post images"      ON storage.objects;

-- Objects are stored at "{user_id}/{random}.jpg" — the first path
-- segment must equal the uploader's own user id.
CREATE POLICY "Users can upload own post images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own post images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'post-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own post images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'post-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public can read post images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Users can upload own event images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own event images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own event images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read event images"      ON storage.objects;

CREATE POLICY "Users can upload own event images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'event-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own event images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'event-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own event images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'event-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public can read event images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'event-images');

-- Missing indexes on the FK columns the feed/events queries join and
-- filter on. Primary keys are indexed automatically; these weren't,
-- so every embedded "post_likes(user_id)" / "post_comments(...)" /
-- author lookup degrades to a sequential scan as the tables grow.
CREATE INDEX IF NOT EXISTS idx_posts_author          ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at      ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_likes_post        ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post     ON public.post_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_events_author          ON public.events (author_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event      ON public.event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_likes_event      ON public.event_likes (event_id);
