-- =============================================================
-- Post reporting + admin moderation (MVP: posts only).
--
-- Privacy model:
--   * Nobody reads `reports` / `moderation_actions` directly — RLS is on
--     with no policies, and table grants are revoked. All access goes
--     through the SECURITY DEFINER functions below.
--   * Reporters never see other reports. Admins see the reason, the
--     reporter's free-text details, and a content snapshot — never the
--     reporter's id or the post author's id/name/email. Identity reveal
--     stays a separate capability (admin_reveal_post_author).
--   * The reported author is resolved server-side; the client only sends
--     a post id.
--
-- Moderation "hide" uses a RESTRICTIVE select policy on posts, so it
-- composes with whatever permissive policies already exist there (posts'
-- base policies were created outside the migrations folder).
-- =============================================================

-- 1. Tables ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type      TEXT NOT NULL CHECK (target_type IN ('post')),
  -- No FK: the report (and its snapshot) must survive the post being removed.
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

-- 2. Hiding posts ---------------------------------------------------

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Moderation: hide hidden posts" ON public.posts;
CREATE POLICY "Moderation: hide hidden posts"
  ON public.posts AS RESTRICTIVE FOR SELECT
  USING (hidden_at IS NULL OR author_id = auth.uid() OR public.is_admin());

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.posts'::regclass) THEN
    RAISE WARNING 'RLS is disabled on public.posts: moderation "hide" will have no effect until it is enabled.';
  END IF;
END $$;

-- 3. Reporter RPC ---------------------------------------------------

-- Returns 'created' or 'duplicate'. Raises with a stable message for
-- every rejection so the client can map it to friendly copy.
CREATE OR REPLACE FUNCTION public.submit_post_report(
  p_post_id UUID,
  p_reason  TEXT,
  p_details TEXT DEFAULT NULL
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
  v_post    RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
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

  SELECT id, author_id, title, content, image_url, category, created_at, hidden_at
    INTO v_post
    FROM public.posts
   WHERE id = p_post_id;
  -- A hidden post is treated as gone for anyone who could not see it.
  IF NOT FOUND OR (v_post.hidden_at IS NOT NULL AND v_post.author_id <> v_uid AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_post.author_id = v_uid THEN
    RAISE EXCEPTION 'cannot_report_own' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reports
     WHERE reporter_id = v_uid AND target_type = 'post' AND target_id = p_post_id
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
    VALUES (
      v_uid, 'post', p_post_id, p_reason, v_details,
      jsonb_build_object(
        'title', v_post.title,
        'content', v_post.content,
        'image_url', v_post.image_url,
        'category', v_post.category,
        'created_at', v_post.created_at
      )
    );
  EXCEPTION WHEN unique_violation THEN
    -- Double submit that raced past the EXISTS check above.
    RETURN 'duplicate';
  END;

  RETURN 'created';
END;
$$;

-- 4. Admin RPCs -----------------------------------------------------

-- Deliberately omits reporter_id and the post's author_id.
CREATE OR REPLACE FUNCTION public.admin_list_post_reports(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  id               UUID,
  target_id        UUID,
  reason           TEXT,
  details          TEXT,
  status           TEXT,
  action_taken     TEXT,
  moderator_note   TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  content_snapshot JSONB,
  post_exists      BOOLEAN,
  post_hidden      BOOLEAN,
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
  SELECT r.id, r.target_id, r.reason, r.details, r.status, r.action_taken,
         r.moderator_note, r.reviewed_at, r.created_at, r.content_snapshot,
         (po.id IS NOT NULL),
         (po.hidden_at IS NOT NULL),
         CASE WHEN po.id IS NULL THEN NULL ELSE jsonb_build_object(
           'title', po.title,
           'content', po.content,
           'image_url', po.image_url,
           'category', po.category
         ) END
    FROM public.reports r
    LEFT JOIN public.posts po ON po.id = r.target_id
   WHERE r.target_type = 'post'
     AND (p_status IS NULL OR r.status = p_status)
   ORDER BY r.created_at DESC
   LIMIT 500;
END;
$$;

-- Applies one decision to a group of reports about the same post:
-- a status change, optionally with a content action, plus an audit row.
CREATE OR REPLACE FUNCTION public.admin_moderate_post_reports(
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
  v_targets   UUID[];
  v_target    UUID;
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

  SELECT array_agg(DISTINCT r.target_id) INTO v_targets
    FROM public.reports r
   WHERE r.id = ANY (p_report_ids) AND r.target_type = 'post';
  IF v_targets IS NULL
     OR cardinality(v_targets) <> 1
     OR (SELECT count(*) FROM public.reports WHERE id = ANY (p_report_ids)) <> cardinality(p_report_ids) THEN
    RAISE EXCEPTION 'reports_must_share_one_post' USING ERRCODE = '22023';
  END IF;
  v_target := v_targets[1];

  IF v_action = 'hide' THEN
    UPDATE public.posts SET hidden_at = now() WHERE id = v_target AND hidden_at IS NULL;
    v_taken := 'hidden';
  ELSIF v_action = 'unhide' THEN
    UPDATE public.posts SET hidden_at = NULL WHERE id = v_target;
    v_taken := 'unhidden';
  ELSIF v_action = 'remove' THEN
    -- The report keeps its content_snapshot as the record of what was removed.
    DELETE FROM public.posts WHERE id = v_target;
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
  VALUES (auth.uid(), v_action, 'post', v_target, p_report_ids, p_status, v_note);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_post_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_post_reports(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_moderate_post_reports(UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_post_report(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_post_reports(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_post_reports(UUID[], TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
