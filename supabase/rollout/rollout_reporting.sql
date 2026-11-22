-- =============================================================
-- Production rollout: reporting, blocking, admin dashboard.
-- Run through supabase/rollout/apply_rollout.ps1 (psql, one transaction).
-- Any failed check or statement rolls everything back.
--
-- 1. Reconcile supabase_migrations.schema_migrations with the repo
--    (what `supabase migration repair` would do). Production already
--    has these changes; they were applied by hand or under old version
--    numbers (verified 2026-11-22):
--      - old names 20260829000100, 20260830000000, 20261024000000,
--        20261024000100 -> renumbered 20261121000000..000400
--      - 20260829000001, 20260905000000..000002 (applied, unrecorded)
--      - 20261120000000 security hotfix (applied in the SQL editor)
--    20260829000000 stays (only its name is corrected).
-- 2. Apply 20261121000500, 000600, 000700 and record them.
-- 3. Check the result before committing.
-- =============================================================
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;

-- Preconditions ---------------------------------------------------------
DO $$
DECLARE
  expected text[] := ARRAY['20260410000000','20260410000001','20260410000002','20260412000000',
    '20260412000001','20260427000000','20260606000000','20260612000000','20260612000001',
    '20260811000000','20260811000001','20260811000002','20260829000000','20260829000100',
    '20260830000000','20261024000000','20261024000100'];
  actual text[];
BEGIN
  SELECT array_agg(version ORDER BY version) INTO actual FROM supabase_migrations.schema_migrations;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'migration history is not what was verified on 2026-11-22: %', actual;
  END IF;
  IF to_regclass('public.reports') IS NOT NULL OR to_regclass('public.user_blocks') IS NOT NULL THEN
    RAISE EXCEPTION 'reports/user_blocks already exist - rollout already applied?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_profile_privileges'
                 AND tgrelid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'security hotfix (20261120000000) is not applied';
  END IF;
END $$;

-- 1. History ------------------------------------------------------------
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20260829000100', '20260830000000', '20261024000000', '20261024000100');
UPDATE supabase_migrations.schema_migrations SET name = 'add_admin_author_reveal_rpc'
WHERE version = '20260829000000';
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260829000001', 'make_past_events_view_only'),
  ('20260905000000', 'anonymize_marketplace_chat_names'),
  ('20260905000001', 'anonymize_event_chat_names'),
  ('20260905000002', 'refresh_admin_reveal_rpc'),
  ('20261120000000', 'security_hotfix'),
  ('20261121000000', 'marketplace_hardening'),
  ('20261121000100', 'marketplace_location_fields'),
  ('20261121000200', 'post_event_image_storage'),
  ('20261121000300', 'cleanup_test_base64_images'),
  ('20261121000400', 'image_upload_limits');

-- 2. Apply --------------------------------------------------------------
\ir ../migrations/20261121000500_reports_moderation.sql
\ir ../migrations/20261121000600_user_blocks.sql
\ir ../migrations/20261121000700_admin_dashboard.sql
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20261121000500', 'reports_moderation'),
  ('20261121000600', 'user_blocks'),
  ('20261121000700', 'admin_dashboard');

-- 3. Checks -------------------------------------------------------------
DO $$
DECLARE t text; missing text[] := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['reports', 'moderation_actions', 'user_blocks'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity) THEN
      missing := missing || (t || ' (with RLS)');
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'anon can read public.%', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['posts', 'post_comments', 'marketplace_items', 'marketplace_comments', 'events', 'event_comments'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = t AND column_name = 'hidden_at') THEN
      missing := missing || (t || '.hidden_at');
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['submit_report', 'admin_list_reports', 'admin_moderate_reports', 'block_author_of',
                           'list_my_blocks', 'unblock', 'admin_report_counts', 'admin_list_moderation_actions',
                           'admin_block_stats'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = t) THEN
      missing := missing || (t || '()');
    END IF;
  END LOOP;
  IF missing <> '{}' THEN
    RAISE EXCEPTION 'rollout incomplete, rolling back: %', missing;
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 26 THEN
    RAISE EXCEPTION 'unexpected migration history size';
  END IF;
END $$;

COMMIT;
