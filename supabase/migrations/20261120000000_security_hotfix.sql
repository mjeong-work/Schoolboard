-- =============================================================
-- Security hotfix (audit 2026-11-22). Standalone and idempotent:
-- safe to run on its own in the SQL editor before the 20261121 batch,
-- and safe to re-run.
--
--   1. Privilege escalation: any signed-in user could make themselves
--      an Administrator, either by updating their own profile row
--      (the UPDATE policy has no column limits) or by signing up with
--      role = 'Administrator' in the auth metadata (handle_new_user
--      copies it). Admins can call admin_reveal_* and see real
--      identities, so this also breaks anonymity.
--      -> trigger that stops non-admins changing role (to/from
--         Administrator), status, verified or email, and that never
--         lets a new profile start as an approved Administrator.
--   2. profiles: drop the "authenticated users can view all profiles"
--      policy if it exists (lets every member read real names and
--      emails). Own-row and admin policies stay.
--   3. Anonymous visitors (anon key, not signed in) could read posts,
--      comments, likes, marketplace listings (incl. contact and
--      location) and saves on production, because of policies that are
--      not in this repo. The app only loads data after sign-in, so
--      anon needs no table access at all.
--      -> revoke table privileges from anon. RPCs used before sign-in
--         (get_email_by_username, is_school_email) are functions and
--         are not affected.
--   4. _backup_20261024_* tables (base64 image copies) were publicly
--      readable. Same lock-down as 20261121000300, applied early.
--
--   5. Impersonation: on production, INSERT policies on posts,
--      post_comments and post_likes have WITH CHECK (true), so a member
--      could post, comment or like under another member's id. Profiles
--      has an "Enable insert for authenticated users" WITH CHECK (true).
--      -> RESTRICTIVE insert policies requiring the owner column to be
--         auth.uid() on every user-content table. Restrictive policies
--         apply on top of whatever permissive ones exist, so this works
--         without knowing every drifted policy name.
--
-- Not changed here (needs a product decision): get_email_by_username
-- lets anyone turn a username into an email address.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

-- 1. Profile privilege guard -----------------------------------------
CREATE OR REPLACE FUNCTION app_private.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Client requests run with role anon/authenticated (PostgREST sets it;
  -- SECURITY DEFINER doesn't change it). Inside handle_new_user, fired by
  -- an auth.users insert, we're one trigger level deeper and the values
  -- come straight from user-controlled signup metadata.
  IF TG_OP = 'INSERT' THEN
    IF pg_trigger_depth() > 1
       OR current_setting('role', true) IN ('anon', 'authenticated') THEN
      IF NEW.role = 'Administrator' THEN
        NEW.role := 'Current Student';
      END IF;
      NEW.status := 'pending';
      NEW.verified := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF current_setting('role', true) IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND (NEW.role = 'Administrator' OR OLD.role = 'Administrator') THEN
      RAISE EXCEPTION 'Only an administrator can change administrator roles'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.verified IS DISTINCT FROM OLD.verified
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Only an administrator can change account status, verification or email'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_profile_privileges() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
CREATE TRIGGER guard_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_profile_privileges();

-- 2. No member-wide profile reads ------------------------------------
DROP POLICY IF EXISTS "authenticated users can view all profiles" ON public.profiles;

-- 3. Anonymous visitors get no table access --------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 4. Image backup tables: service role only --------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['_backup_20261024_posts_images',
                           '_backup_20261024_events_images',
                           '_backup_20261024_marketplace_items_images'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- 5. Content is always inserted under your own id -----------------------
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.profiles;

DO $$
DECLARE
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['posts', 'author_id'],
    ['post_comments', 'author_id'],
    ['post_likes', 'user_id'],
    ['post_history', 'edited_by'],
    ['events', 'author_id'],
    ['event_comments', 'author_id'],
    ['event_likes', 'user_id'],
    ['event_rsvps', 'user_id'],
    ['marketplace_items', 'seller_id'],
    ['marketplace_comments', 'author_id'],
    ['marketplace_saves', 'user_id']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = pair[1] AND column_name = pair[2]) THEN
      EXECUTE format('DROP POLICY IF EXISTS "Owner: insert as yourself" ON public.%I', pair[1]);
      EXECUTE format(
        'CREATE POLICY "Owner: insert as yourself" ON public.%I AS RESTRICTIVE FOR INSERT
           TO authenticated WITH CHECK (%I = (SELECT auth.uid()))', pair[1], pair[2]);
    END IF;
  END LOOP;
END $$;
