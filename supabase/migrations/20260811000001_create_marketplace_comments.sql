-- =============================================================
-- marketplace_comments — comments on marketplace listings.
-- Direct copy of the event_comments pattern (20260412000000 /
-- 20260412000001), just repointed at marketplace_items.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.marketplace_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID        NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES public.profiles(id)          ON DELETE CASCADE,
  text       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_comments_item ON public.marketplace_comments (item_id);

ALTER TABLE public.marketplace_comments ENABLE ROW LEVEL SECURITY;

-- read all, authenticated insert, author/admin delete — same shape as
-- event_comments' policies, reusing the public.is_admin() helper.
DROP POLICY IF EXISTS "authenticated users can view marketplace comments" ON public.marketplace_comments;
CREATE POLICY "authenticated users can view marketplace comments"
  ON public.marketplace_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated users can add marketplace comments" ON public.marketplace_comments;
CREATE POLICY "authenticated users can add marketplace comments"
  ON public.marketplace_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "author or admin can delete marketplace comments" ON public.marketplace_comments;
CREATE POLICY "author or admin can delete marketplace comments"
  ON public.marketplace_comments FOR DELETE
  USING (auth.uid() = author_id OR public.is_admin());
