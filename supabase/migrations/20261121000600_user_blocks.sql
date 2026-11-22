-- =============================================================
-- User blocking MVP (spec: docs/week1-reporting-blocking-spec.md §2–3,
-- policy: docs/reporting-blocking-mvp.md).
--
-- Policy — when A blocks B (symmetric; either direction counts):
--   * Neither sees the other's posts, listings, events or comments.
--   * Neither can like, comment on, save or RSVP to the other's content.
--   * Neither can start a new conversation with the other, and no new
--     messages can be sent in an existing one (history stays readable).
--   * Your own content is always visible to you; admins are exempt so
--     moderation keeps working.
--   * B is never told. Blocks are keyed on internal user ids, but the
--     client never sends or receives one: it names a piece of content and
--     the server resolves its author.
--
-- Depends on app_private.content_target from 20261121000500.
-- =============================================================

-- 1. Table ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Where the block was made from, and the alias shown there — aliases are
  -- per item, so this is the only name the blocker ever saw for them.
  source_type  TEXT NOT NULL CHECK (source_type IN (
                 'post', 'post_comment',
                 'marketplace_item', 'marketplace_comment',
                 'event', 'event_comment')),
  source_alias TEXT CHECK (source_alias IS NULL OR char_length(source_alias) <= 80),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT user_blocks_pair_unique UNIQUE (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM anon, authenticated;

-- 2. Helpers used inside RLS (app_private, not exposed) -------------
-- SECURITY DEFINER so policies can consult user_blocks, which the
-- querying role can't read.

-- Everyone the current user has blocked or been blocked by.
CREATE OR REPLACE FUNCTION app_private.block_peer_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(peer), '{}')
    FROM (
      SELECT blocked_id AS peer FROM public.user_blocks WHERE blocker_id = auth.uid()
      UNION
      SELECT blocker_id FROM public.user_blocks WHERE blocked_id = auth.uid()
    ) s
$$;

CREATE OR REPLACE FUNCTION app_private.is_block_peer(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks
     WHERE (blocker_id = auth.uid() AND blocked_id = p_user)
        OR (blocker_id = p_user AND blocked_id = auth.uid())
  )
$$;

-- Owner of a parent item, even if the caller can no longer see it.
CREATE OR REPLACE FUNCTION app_private.content_owner(p_type TEXT, p_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id FROM app_private.content_target(p_type, p_id)
$$;

CREATE OR REPLACE FUNCTION app_private.conversation_has_block_peer(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = p_conversation_id
       AND cp.user_id <> auth.uid()
       AND app_private.is_block_peer(cp.user_id)
  )
$$;

REVOKE ALL ON FUNCTION app_private.block_peer_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_block_peer(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.content_owner(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.conversation_has_block_peer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.block_peer_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_block_peer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.content_owner(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.conversation_has_block_peer(UUID) TO authenticated;

-- 3. Visibility (RESTRICTIVE: ANDs with the existing SELECT policies) -
-- The scalar `(SELECT ...)` makes Postgres evaluate the peer list once per
-- query (an InitPlan) instead of once per row.

DROP POLICY IF EXISTS "Blocks: hide blocked authors" ON public.posts;
CREATE POLICY "Blocks: hide blocked authors"
  ON public.posts AS RESTRICTIVE FOR SELECT
  USING (author_id IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
         OR NOT (author_id = ANY (COALESCE((SELECT app_private.block_peer_ids()), '{}'))));

DROP POLICY IF EXISTS "Blocks: hide blocked authors" ON public.post_comments;
CREATE POLICY "Blocks: hide blocked authors"
  ON public.post_comments AS RESTRICTIVE FOR SELECT
  USING (author_id IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
         OR NOT (author_id = ANY (COALESCE((SELECT app_private.block_peer_ids()), '{}'))));

DROP POLICY IF EXISTS "Blocks: hide blocked sellers" ON public.marketplace_items;
CREATE POLICY "Blocks: hide blocked sellers"
  ON public.marketplace_items AS RESTRICTIVE FOR SELECT
  USING (seller_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
         OR NOT (seller_id = ANY (COALESCE((SELECT app_private.block_peer_ids()), '{}'))));

DROP POLICY IF EXISTS "Blocks: hide blocked authors" ON public.marketplace_comments;
CREATE POLICY "Blocks: hide blocked authors"
  ON public.marketplace_comments AS RESTRICTIVE FOR SELECT
  USING (author_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
         OR NOT (author_id = ANY (COALESCE((SELECT app_private.block_peer_ids()), '{}'))));

DROP POLICY IF EXISTS "Blocks: hide blocked authors" ON public.events;
CREATE POLICY "Blocks: hide blocked authors"
  ON public.events AS RESTRICTIVE FOR SELECT
  USING (author_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
         OR NOT (author_id = ANY (COALESCE((SELECT app_private.block_peer_ids()), '{}'))));

DROP POLICY IF EXISTS "Blocks: hide blocked authors" ON public.event_comments;
CREATE POLICY "Blocks: hide blocked authors"
  ON public.event_comments AS RESTRICTIVE FOR SELECT
  USING (author_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
         OR NOT (author_id = ANY (COALESCE((SELECT app_private.block_peer_ids()), '{}'))));

-- 4. Interactions (RESTRICTIVE INSERT) ------------------------------

DROP POLICY IF EXISTS "Blocks: no likes across a block" ON public.post_likes;
CREATE POLICY "Blocks: no likes across a block"
  ON public.post_likes AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('post', post_id)));

DROP POLICY IF EXISTS "Blocks: no comments across a block" ON public.post_comments;
CREATE POLICY "Blocks: no comments across a block"
  ON public.post_comments AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('post', post_id)));

DROP POLICY IF EXISTS "Blocks: no saves across a block" ON public.marketplace_saves;
CREATE POLICY "Blocks: no saves across a block"
  ON public.marketplace_saves AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('marketplace_item', item_id)));

DROP POLICY IF EXISTS "Blocks: no comments across a block" ON public.marketplace_comments;
CREATE POLICY "Blocks: no comments across a block"
  ON public.marketplace_comments AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('marketplace_item', item_id)));

DROP POLICY IF EXISTS "Blocks: no likes across a block" ON public.event_likes;
CREATE POLICY "Blocks: no likes across a block"
  ON public.event_likes AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('event', event_id)));

DROP POLICY IF EXISTS "Blocks: no RSVPs across a block" ON public.event_rsvps;
CREATE POLICY "Blocks: no RSVPs across a block"
  ON public.event_rsvps AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('event', event_id)));

DROP POLICY IF EXISTS "Blocks: no comments across a block" ON public.event_comments;
CREATE POLICY "Blocks: no comments across a block"
  ON public.event_comments AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(app_private.content_owner('event', event_id)));

-- New conversations: you can't add a block peer as a participant.
DROP POLICY IF EXISTS "Blocks: no conversations across a block" ON public.conversation_participants;
CREATE POLICY "Blocks: no conversations across a block"
  ON public.conversation_participants AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.is_block_peer(user_id));

-- Existing conversations become read-only.
DROP POLICY IF EXISTS "Blocks: no messages across a block" ON public.messages;
CREATE POLICY "Blocks: no messages across a block"
  ON public.messages AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_private.conversation_has_block_peer(conversation_id));

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_likes', 'marketplace_saves', 'event_likes', 'event_rsvps',
                           'conversation_participants', 'messages'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE WARNING 'RLS is disabled on public.%: block interaction rules will have no effect there until it is enabled.', t;
    END IF;
  END LOOP;
END $$;

-- 5. RPCs -----------------------------------------------------------

-- Blocks whoever wrote the given content. Returns 'blocked' or
-- 'already_blocked'; never returns the blocked user's id.
CREATE OR REPLACE FUNCTION public.block_author_of(
  p_target_type  TEXT,
  p_target_id    UUID,
  p_source_alias TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
  v_alias TEXT := left(NULLIF(btrim(p_source_alias), ''), 80);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF app_private.content_table(p_target_type) IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  v_owner := app_private.content_owner(p_target_type, p_target_id);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner = v_uid THEN
    RAISE EXCEPTION 'cannot_block_self' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.user_blocks WHERE blocker_id = v_uid) >= 1000 THEN
    RAISE EXCEPTION 'too_many_blocks' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id, source_type, source_alias)
  VALUES (v_uid, v_owner, p_target_type, v_alias)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  RETURN CASE WHEN FOUND THEN 'blocked' ELSE 'already_blocked' END;
END;
$$;

-- The caller's own blocks, newest first — alias and date only.
CREATE OR REPLACE FUNCTION public.list_my_blocks()
RETURNS TABLE (id UUID, source_type TEXT, source_alias TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.source_type, b.source_alias, b.created_at
    FROM public.user_blocks b
   WHERE b.blocker_id = auth.uid()
   ORDER BY b.created_at DESC
$$;

-- Removes one of the caller's own blocks. Returns false if it wasn't theirs
-- or no longer exists.
CREATE OR REPLACE FUNCTION public.unblock(p_block_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM public.user_blocks WHERE id = p_block_id AND blocker_id = auth.uid();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.block_author_of(TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_blocks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_author_of(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_blocks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
