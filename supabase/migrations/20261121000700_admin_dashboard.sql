-- =============================================================
-- Admin dashboard read models: report counts, per-item moderation
-- history, and aggregate blocking statistics. All three are
-- read-only, admin-only (is_admin() checked inside), and return no
-- user ids, names or emails.
--
-- Depends on 20261121000500 (reports, moderation_actions,
-- app_private.content_owner via 000600) and 20261121000600 (user_blocks).
-- =============================================================

-- Counts for the dashboard summary cards and the Reports tab badge,
-- without downloading the queue itself.
CREATE OR REPLACE FUNCTION public.admin_report_counts()
RETURNS TABLE (status TEXT, target_type TEXT, report_count BIGINT)
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
  SELECT r.status, r.target_type, count(*)
    FROM public.reports r
   GROUP BY r.status, r.target_type;
END;
$$;

-- Audit trail for one piece of content. `by_me` replaces the acting
-- admin's id so the history doesn't become an admin directory.
CREATE OR REPLACE FUNCTION public.admin_list_moderation_actions(
  p_target_type TEXT,
  p_target_id   UUID
)
RETURNS TABLE (
  id           UUID,
  action       TEXT,
  status       TEXT,
  note         TEXT,
  report_count INT,
  created_at   TIMESTAMPTZ,
  by_me        BOOLEAN
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
  SELECT m.id, m.action, m.status, m.note, cardinality(m.report_ids), m.created_at,
         (m.actor_id = auth.uid())
    FROM public.moderation_actions m
   WHERE m.target_type = p_target_type AND m.target_id = p_target_id
   ORDER BY m.created_at DESC
   LIMIT 100;
END;
$$;

-- Aggregate-only view of blocking. Deliberately never returns who blocked
-- whom; "repeatedly blocked" and "blocked while reported" are counts of
-- accounts, not lists, so they flag that something needs attention
-- without exposing relationships.
CREATE OR REPLACE FUNCTION public.admin_block_stats()
RETURNS TABLE (
  total_blocks                  BIGINT,
  blocks_last_7_days            BIGINT,
  blocks_last_30_days           BIGINT,
  accounts_blocking             BIGINT,
  accounts_blocked              BIGINT,
  accounts_blocked_by_3_plus    BIGINT,
  blocked_with_open_reports     BIGINT,
  by_source                     JSONB
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
  WITH open_report_owners AS (
    SELECT DISTINCT app_private.content_owner(r.target_type, r.target_id) AS owner_id
      FROM public.reports r
     WHERE r.status IN ('pending', 'under_review')
  )
  SELECT
    (SELECT count(*) FROM public.user_blocks),
    (SELECT count(*) FROM public.user_blocks WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.user_blocks WHERE created_at > now() - interval '30 days'),
    (SELECT count(DISTINCT blocker_id) FROM public.user_blocks),
    (SELECT count(DISTINCT blocked_id) FROM public.user_blocks),
    (SELECT count(*) FROM (
       SELECT blocked_id FROM public.user_blocks GROUP BY blocked_id HAVING count(*) >= 3
     ) s),
    (SELECT count(DISTINCT b.blocked_id) FROM public.user_blocks b
      WHERE b.blocked_id IN (SELECT owner_id FROM open_report_owners)),
    COALESCE((SELECT jsonb_object_agg(source_type, n)
                FROM (SELECT source_type, count(*) AS n FROM public.user_blocks GROUP BY source_type) s),
             '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_moderation_actions(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_block_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_report_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_moderation_actions(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
