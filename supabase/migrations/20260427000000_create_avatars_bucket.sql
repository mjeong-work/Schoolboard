-- Create a public bucket for user avatar images.
-- Each user's avatar is stored at the path equal to their user ID
-- (no extension; content-type is set explicitly on upload).
-- upsert:true on the client always replaces the same object, so there
-- is never more than one file per user.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Drop any stale policies so this migration is re-runnable
DROP POLICY IF EXISTS "Users can upload own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Public can read avatars"       ON storage.objects;

-- Authenticated users may upload/replace only the object whose name
-- equals their own user ID (the pattern we use on the client).
CREATE POLICY "Users can upload own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = name
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = name
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = name
  );

-- Anyone (including unauthenticated visitors) may read avatar images.
CREATE POLICY "Public can read avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
