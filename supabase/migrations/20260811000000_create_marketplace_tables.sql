-- =============================================================
-- Retroactive migration: marketplace_items, marketplace_saves,
-- increment_marketplace_views RPC.
--
-- These objects already exist on the live project (created out of
-- band via the SQL editor) — dataContext.tsx has been querying
-- `marketplace_items` / `marketplace_saves` and calling the
-- `increment_marketplace_views` RPC since the marketplace feature
-- shipped, but no migration file ever captured that schema. This
-- file documents it in version control and is safe to run against
-- an environment that already has these objects (every statement
-- is written to be idempotent) as well as a fresh environment that
-- doesn't.
--
-- Mirrors the events schema pattern (see 20260412000000).
-- =============================================================

-- 1. marketplace_items ------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  price       NUMERIC     NOT NULL,
  condition   TEXT        NOT NULL,
  description TEXT        NOT NULL,
  image_url   TEXT,
  contact     TEXT,
  views       INTEGER     NOT NULL DEFAULT 0,
  seller_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. marketplace_saves (who saved/hearted which item) ------------
CREATE TABLE IF NOT EXISTS public.marketplace_saves (
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id)                ON DELETE CASCADE,
  PRIMARY KEY (item_id, user_id)
);

-- 3. Indexes -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller ON public.marketplace_items (seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_saves_user   ON public.marketplace_saves (user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_saves_item   ON public.marketplace_saves (item_id);

-- 4. RLS -------------------------------------------------------------
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_saves ENABLE ROW LEVEL SECURITY;

-- marketplace_items: any authenticated user can read; seller inserts;
-- seller/admin deletes. is_admin() is the non-recursive helper introduced
-- in 20260612000001_fix_rls_recursion.sql.
DROP POLICY IF EXISTS "authenticated users can view marketplace items" ON public.marketplace_items;
CREATE POLICY "authenticated users can view marketplace items"
  ON public.marketplace_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated users can create marketplace items" ON public.marketplace_items;
CREATE POLICY "authenticated users can create marketplace items"
  ON public.marketplace_items FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "seller or admin can delete marketplace items" ON public.marketplace_items;
CREATE POLICY "seller or admin can delete marketplace items"
  ON public.marketplace_items FOR DELETE
  USING (auth.uid() = seller_id OR public.is_admin());

-- marketplace_saves: read all (needed to compute savedBy / counts), manage own
DROP POLICY IF EXISTS "authenticated users can view marketplace saves" ON public.marketplace_saves;
CREATE POLICY "authenticated users can view marketplace saves"
  ON public.marketplace_saves FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "users can manage own marketplace saves" ON public.marketplace_saves;
CREATE POLICY "users can manage own marketplace saves"
  ON public.marketplace_saves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can delete own marketplace saves" ON public.marketplace_saves;
CREATE POLICY "users can delete own marketplace saves"
  ON public.marketplace_saves FOR DELETE
  USING (auth.uid() = user_id);

-- 5. increment_marketplace_views RPC ---------------------------------
-- SECURITY DEFINER so any authenticated (or anonymous) viewer can bump
-- the counter without needing an UPDATE policy on marketplace_items.
CREATE OR REPLACE FUNCTION public.increment_marketplace_views(item_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.marketplace_items SET views = views + 1 WHERE id = item_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_marketplace_views(UUID) TO authenticated;
