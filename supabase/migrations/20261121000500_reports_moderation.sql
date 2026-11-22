-- =============================================================
-- Reporting + admin moderation for posts, listings, events and their
-- comments.
--
-- Originally written as 20261108000000_post_reports_moderation (posts
-- only, never applied to any database). Generalized here to every
-- content type and renumbered to run after 20261121000400.
--
-- Privacy model:
--   * Nobody reads `reports` / `moderation_actions` directly — RLS is on
--     with no policies, and table grants are revoked. All access goes
--     through the SECURITY DEFINER functions below.
--   * Reporters never see other reports. Admins see the reason, the
--     reporter's free-text details, and a content snapshot — never the
--     reporter's id or the author's id/name/email. Identity reveal stays a
--     separate capability (admin_reveal_post_author / _listing_seller).
--   * The reported author is resolved server-side; the client only sends
--     a content type + id.
--
-- Moderation "hide" uses a RESTRICTIVE select policy on each content
-- table, so it composes with whatever permissive policies already exist
-- there (posts' base policies were created outside the migrations folder).
--
-- Internal helpers live in the app_private schema, which PostgREST does
-- not expose, so they can't be called from the client.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
-- Block-visibility helpers (next migration) are evaluated inside RLS
-- policies as the querying role, so that role needs USAGE. EXECUTE is
-- granted per function, never schema-wide.
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- 1. Tables ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type      TEXT NOT NULL CHECK (target_type IN (
                     'post', 'post_comment',
                     'marketplace_item', 'marketplace_comment',
                     'event', 'event_comment')),
  -- No FK: the report (and its snapshot) must survive the content being removed.
  target_id        UUID NOT NULL,
  reason           TEXT NOT NULL CHECK (reason IN (
                     'spam', 'harassment', 'hate', 'sexual_content',
                     'violence_or_threat', 'personal_info', 'impersonation', 'other')),
  details          TEXT CHECK (details IS NULL OR char_length(details) <= 500),
  content_snapshot JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
  action_taken     TEXT CHECK (action_taken IN ('none', 'hidden', 'unhidden', 'removed')),
  moderator_note   TEXT CHECK (moderator_note IS NULL OR char_length(moderator_note) <= 1000),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open report per reporter per target; a re-report after the earlier
-- one was closed is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_open_per_reporter
  ON public.reports (reporter_id, target_type, target_id)
  WHERE status IN ('pending', 'under_review');
CREATE INDEX IF NOT EXISTS reports_status_created ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target ON public.reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS reports_reporter_created ON public.reports (reporter_id, created_at DESC);

-- Append-only audit log of moderator decisions.
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   UUID NOT NULL,
  report_ids  UUID[] NOT NULL DEFAULT '{}',
  status      TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_actions_target ON public.moderation_actions (target_type, target_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reports FROM anon, authenticated;
REVOKE ALL ON public.moderation_actions FROM anon, authenticated;

-- 2. Hiding content -------------------------------------------------
-- The author still sees their own hidden content; admins see everything.

ALTER TABLE public.posts                ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.post_comments        ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_items    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_comments ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.events               ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.event_comments       ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Moderation: hide hidden posts" ON public.posts;
CREATE POLICY "Moderation: hide hidden posts"
  ON public.posts AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Moderation: hide hidden post comments" ON public.post_comments;
CREATE POLICY "Moderation: hide hidden post comments"
  ON public.post_comments AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Moderation: hide hidden listings" ON public.marketplace_items;
CREATE POLICY "Moderation: hide hidden listings"
  ON public.marketplace_items AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR seller_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Moderation: hide hidden listing comments" ON public.marketplace_comments;
CREATE POLICY "Moderation: hide hidden listing comments"
  ON public.marketplace_comments AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Moderation: hide hidden events" ON public.events;
CREATE POLICY "Moderation: hide hidden events"
  ON public.events AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Moderation: hide hidden event comments" ON public.event_comments;
CREATE POLICY "Moderation: hide hidden event comments"
  ON public.event_comments AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR author_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- Authors may UPDATE their own rows (edit post/listing), which would
-- otherwise let them clear hidden_at and un-hide moderated content.
-- Only admins (directly, or via admin_moderate_reports) may change it.
CREATE OR REPLACE FUNCTION app_private.guard_hidden_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.hidden_at := NULL;
  ELSIF NEW.hidden_at IS DISTINCT FROM OLD.hidden_at AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'hidden_at_admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts', 'post_comments', 'marketplace_items',
                           'marketplace_comments', 'events', 'event_comments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_hidden_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER guard_hidden_at BEFORE INSERT OR UPDATE OF hidden_at ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION app_private.guard_hidden_at()', t);
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE WARNING 'RLS is disabled on public.%: moderation "hide" and user blocks will have no effect there until it is enabled.', t;
    END IF;
  END LOOP;
END $$;

-- 3. Internal helpers (app_private, not exposed) --------------------

-- Whitelisted content type -> table name. NULL for anything else.
CREATE OR REPLACE FUNCTION app_private.content_table(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'post'                THEN 'posts'
    WHEN 'post_comment'        THEN 'post_comments'
    WHEN 'marketplace_item'    THEN 'marketplace_items'
    WHEN 'marketplace_comment' THEN 'marketplace_comments'
    WHEN 'event'               THEN 'events'
    WHEN 'event_comment'       THEN 'event_comments'
  END
$$;

-- Owner, hidden state and a normalized content snapshot for one piece of
-- content, read without RLS. Zero rows when it doesn't exist. Snapshot
-- keys: title, content, image_url, category, created_at, and for
-- comments parent_id / parent_title.
CREATE OR REPLACE FUNCTION app_private.content_target(p_type TEXT, p_id UUID)
RETURNS TABLE (owner_id UUID, hidden_at TIMESTAMPTZ, content JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'post' THEN
    RETURN QUERY
    SELECT p.author_id, p.hidden_at, jsonb_build_object(
             'title', p.title, 'content', p.content, 'image_url', p.image_url,
             'category', p.category, 'created_at', p.created_at)
      FROM public.posts p WHERE p.id = p_id;
  ELSIF p_type = 'post_comment' THEN
    RETURN QUERY
    SELECT c.author_id, c.hidden_at, jsonb_build_object(
             'content', c.text, 'created_at', c.created_at,
             'parent_id', c.post_id, 'parent_title', p.title)
      FROM public.post_comments c LEFT JOIN public.posts p ON p.id = c.post_id
     WHERE c.id = p_id;
  ELSIF p_type = 'marketplace_item' THEN
    RETURN QUERY
    SELECT m.seller_id, m.hidden_at, jsonb_build_object(
             'title', m.title, 'content', m.description,
             'image_url', COALESCE(m.image_url, m.images[1]),
             'category', m.category, 'price', m.price, 'created_at', m.created_at)
      FROM public.marketplace_items m WHERE m.id = p_id;
  ELSIF p_type = 'marketplace_comment' THEN
    RETURN QUERY
    SELECT c.author_id, c.hidden_at, jsonb_build_object(
             'content', c.text, 'created_at', c.created_at,
             'parent_id', c.item_id, 'parent_title', m.title)
      FROM public.marketplace_comments c LEFT JOIN public.marketplace_items m ON m.id = c.item_id
     WHERE c.id = p_id;
  ELSIF p_type = 'event' THEN
    RETURN QUERY
    SELECT e.author_id, e.hidden_at, jsonb_build_object(
             'title', e.title, 'content', e.description, 'image_url', e.image_url,
             'category', e.category, 'event_date', e.date, 'created_at', e.created_at)
      FROM public.events e WHERE e.id = p_id;
  ELSIF p_type = 'event_comment' THEN
    RETURN QUERY
    SELECT c.author_id, c.hidden_at, jsonb_build_object(
             'content', c.text, 'created_at', c.created_at,
             'parent_id', c.event_id, 'parent_title', e.title)
      FROM public.event_comments c LEFT JOIN public.events e ON e.id = c.event_id
     WHERE c.id = p_id;
  END IF;
END;
$$;

-- 4. Reporter RPC ---------------------------------------------------

-- Returns 'created' or 'duplicate'. Raises with a stable message for
-- every rejection so the client can map it to friendly copy.
CREATE OR REPLACE FUNCTION public.submit_report(
  p_target_type TEXT,
  p_target_id   UUID,
  p_reason      TEXT,
  p_details     TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_details TEXT := NULLIF(btrim(p_details), '');
  v_target  RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF app_private.content_table(p_target_type) IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN (
    'spam', 'harassment', 'hate', 'sexual_content',
    'violence_or_threat', 'personal_info', 'impersonation', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;
  IF p_reason = 'other' AND v_details IS NULL THEN
    RAISE EXCEPTION 'details_required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_details) > 500 THEN
    RAISE EXCEPTION 'details_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM app_private.content_target(p_target_type, p_target_id);
  -- Hidden content is treated as gone for anyone who could not see it.
  IF NOT FOUND OR (v_target.hidden_at IS NOT NULL AND v_target.owner_id <> v_uid AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.owner_id = v_uid THEN
    RAISE EXCEPTION 'cannot_report_own' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reports
     WHERE reporter_id = v_uid AND target_type = p_target_type AND target_id = p_target_id
       AND status IN ('pending', 'under_review')
  ) THEN
    RETURN 'duplicate';
  END IF;

  IF (SELECT count(*) FROM public.reports
       WHERE reporter_id = v_uid AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
  END IF;

  BEGIN
    INSERT INTO public.reports (reporter_id, target_type, target_id, reason, details, content_snapshot)
    VALUES (v_uid, p_target_type, p_target_id, p_reason, v_details, v_target.content);
  EXCEPTION WHEN unique_violation THEN
    -- Double submit that raced past the EXISTS check above.
    RETURN 'duplicate';
  END;

  RETURN 'created';
END;
$$;

-- 5. Admin RPCs -----------------------------------------------------

-- Deliberately omits reporter_id and the content owner's id.
CREATE OR REPLACE FUNCTION public.admin_list_reports(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  id               UUID,
  target_type      TEXT,
  target_id        UUID,
  reason           TEXT,
  details          TEXT,
  status           TEXT,
  action_taken     TEXT,
  moderator_note   TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  content_snapshot JSONB,
  target_exists    BOOLEAN,
  target_hidden    BOOLEAN,
  live_content     JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.action_taken,
         r.moderator_note, r.reviewed_at, r.created_at, r.content_snapshot,
         (t.content IS NOT NULL),
         (t.hidden_at IS NOT NULL),
         t.content
    FROM public.reports r
    LEFT JOIN LATERAL app_private.content_target(r.target_type, r.target_id) t ON TRUE
   WHERE p_status IS NULL OR r.status = p_status
   ORDER BY r.created_at DESC
   LIMIT 500;
END;
$$;

-- Applies one decision to a group of reports about the same content:
-- a status change, optionally with a content action, plus an audit row.
CREATE OR REPLACE FUNCTION public.admin_moderate_reports(
  p_report_ids UUID[],
  p_status     TEXT,
  p_action     TEXT DEFAULT 'none',
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_targets   TEXT[];
  v_type      TEXT;
  v_target    UUID;
  v_table     TEXT;
  v_note      TEXT := NULLIF(btrim(p_note), '');
  v_action    TEXT := COALESCE(p_action, 'none');
  v_taken     TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_report_ids IS NULL OR cardinality(p_report_ids) = 0 THEN
    RAISE EXCEPTION 'no_reports' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending', 'under_review', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF v_action NOT IN ('none', 'hide', 'unhide', 'remove') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT r.target_type || ':' || r.target_id) INTO v_targets
    FROM public.reports r
   WHERE r.id = ANY (p_report_ids);
  IF v_targets IS NULL
     OR cardinality(v_targets) <> 1
     OR (SELECT count(*) FROM public.reports WHERE id = ANY (p_report_ids)) <> cardinality(p_report_ids) THEN
    RAISE EXCEPTION 'reports_must_share_one_target' USING ERRCODE = '22023';
  END IF;
  SELECT r.target_type, r.target_id INTO v_type, v_target
    FROM public.reports r WHERE r.id = p_report_ids[1];
  v_table := app_private.content_table(v_type);

  -- v_table comes from the whitelist above, never from the caller.
  IF v_action = 'hide' THEN
    EXECUTE format('UPDATE public.%I SET hidden_at = now() WHERE id = $1 AND hidden_at IS NULL', v_table)
      USING v_target;
    v_taken := 'hidden';
  ELSIF v_action = 'unhide' THEN
    EXECUTE format('UPDATE public.%I SET hidden_at = NULL WHERE id = $1', v_table) USING v_target;
    v_taken := 'unhidden';
  ELSIF v_action = 'remove' THEN
    -- The report keeps its content_snapshot as the record of what was removed.
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING v_target;
    v_taken := 'removed';
  END IF;

  UPDATE public.reports
     SET status         = p_status,
         action_taken   = COALESCE(v_taken, CASE WHEN p_status IN ('resolved', 'dismissed') THEN COALESCE(action_taken, 'none') END, action_taken),
         moderator_note = COALESCE(v_note, moderator_note),
         reviewed_at    = CASE WHEN p_status IN ('resolved', 'dismissed') THEN now() ELSE reviewed_at END,
         updated_at     = now()
   WHERE id = ANY (p_report_ids);

  INSERT INTO public.moderation_actions (actor_id, action, target_type, target_id, report_ids, status, note)
  VALUES (auth.uid(), v_action, v_type, v_target, p_report_ids, p_status, v_note);
END;
$$;

-- 6. Grants ---------------------------------------------------------

-- Internal only: called from the SECURITY DEFINER functions here, never by
-- client roles. (Named individually so a re-run can't revoke grants that
-- later migrations give to other app_private functions.)
REVOKE ALL ON FUNCTION app_private.content_table(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.content_target(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_hidden_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_report(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_reports(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_moderate_reports(UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_report(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_reports(UUID[], TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
