-- =============================================================
-- Roll back rollout_reporting.sql (reporting, blocking, admin dashboard).
-- Emergency use only (needs approval). One transaction.
--
-- Removes the reports / moderation_actions / user_blocks tables, the
-- hidden_at columns, their policies, triggers and functions, and the
-- three history rows. THIS DELETES all reports, blocks and moderation
-- history, and un-hides anything that was hidden.
-- Keeps the security hotfix and the history reconciliation.
-- =============================================================
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND (policyname LIKE 'Moderation: %' OR policyname LIKE 'Blocks: %') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND g.tgname = 'guard_hidden_at' LOOP
    EXECUTE format('DROP TRIGGER guard_hidden_at ON public.%I', r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE (n.nspname = 'public' AND p.proname IN ('submit_report', 'admin_list_reports', 'admin_moderate_reports',
                    'block_author_of', 'list_my_blocks', 'unblock', 'admin_report_counts',
                    'admin_list_moderation_actions', 'admin_block_stats'))
              OR (n.nspname = 'app_private' AND p.proname IN ('block_peer_ids', 'content_owner', 'content_table',
                    'content_target', 'conversation_has_block_peer', 'guard_hidden_at', 'is_block_peer')) LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.moderation_actions, public.reports, public.user_blocks;

ALTER TABLE public.posts                DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE public.post_comments        DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE public.marketplace_items    DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE public.marketplace_comments DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE public.events               DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE public.event_comments       DROP COLUMN IF EXISTS hidden_at;

-- 000500 granted this for the block helpers; the hotfix doesn't need it.
REVOKE USAGE ON SCHEMA app_private FROM authenticated;

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20261121000500', '20261121000600', '20261121000700');

COMMIT;
