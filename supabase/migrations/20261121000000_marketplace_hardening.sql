-- =============================================================
-- Marketplace hardening pass (audit follow-up):
--   1. marketplace-images Storage bucket — listing photos move out of
--      the images TEXT[] column (which was holding raw base64) and
--      into real object storage, same pattern as the avatars bucket.
--   2. profiles: intentionally NOT widened. An earlier draft of this
--      migration added an "any authenticated user can view any profile"
--      SELECT policy; that would let any signed-in user map a post's
--      author_id to a real name/email and defeat anonymous posting
--      (see 20260829000000_add_admin_author_reveal_rpc — identity lookup
--      is admin-only via RPC). The policy is dropped defensively below in
--      case that draft was ever applied by hand.
--   3. marketplace_items: price >= 0 check (client already validates
--      this, but nothing enforced it server-side).
--   4. marketplace_items: UPDATE policy (seller or admin) so listings
--      can be edited instead of only ever deleted and recreated.
--
-- Originally numbered 20260829000000, which collided with
-- 20260829000000_add_admin_author_reveal_rpc on main. Renumbered (with
-- the rest of this batch, order preserved) to run after main's latest
-- migration. None of this batch had been applied to a database.
-- =============================================================

-- 1. Storage bucket for listing photos --------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-images', 'marketplace-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read marketplace images"      ON storage.objects;

-- Objects are stored at "{user_id}/{random}-{filename}" — the first
-- path segment must equal the uploader's own user id.
CREATE POLICY "Users can upload own marketplace images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'marketplace-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own marketplace images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'marketplace-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own marketplace images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'marketplace-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public can read marketplace images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'marketplace-images');

-- 2. profiles: keep own-row / admin-only reads (anonymity) -------------
DROP POLICY IF EXISTS "authenticated users can view all profiles" ON public.profiles;

-- 3. marketplace_items: non-negative price -----------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_items_price_nonnegative'
  ) THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT marketplace_items_price_nonnegative CHECK (price >= 0);
  END IF;
END $$;

-- 4. marketplace_items: seller/admin can update (edit listing) --------
DROP POLICY IF EXISTS "seller or admin can update marketplace items" ON public.marketplace_items;
CREATE POLICY "seller or admin can update marketplace items"
  ON public.marketplace_items FOR UPDATE
  USING (auth.uid() = seller_id OR public.is_admin())
  WITH CHECK (auth.uid() = seller_id OR public.is_admin());
