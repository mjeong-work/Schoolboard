-- test_local.sh only: staging gate and isolation checks.
\set ON_ERROR_STOP on
SET client_min_messages = notice;
CREATE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %', label; END $$;
CREATE FUNCTION pg_temp.denied(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: % (%)', label, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'FAIL: % (no error)', label;
END $$;

-- A production member who is not a staging tester (no staging profile).
ALTER TABLE auth.users DISABLE TRIGGER test_enrol;
INSERT INTO auth.users (id, email) VALUES ('eeeeeeee-0000-0000-0000-00000000000e', 'prod.member@school.edu');
ALTER TABLE auth.users ENABLE TRIGGER test_enrol;
INSERT INTO public.profiles (id, email, name, role, status, verified)
VALUES ('eeeeeeee-0000-0000-0000-00000000000e', 'prod.member@school.edu', 'Prod Member', 'Current Student', 'approved', true);
INSERT INTO public.posts (author_id, title, content) VALUES ('eeeeeeee-0000-0000-0000-00000000000e', 'prod post', 'prod');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-00000000000e', false);
SELECT pg_temp.ok((SELECT count(*) FROM staging.posts) = 0, 'non-tester sees no staging posts');
SELECT pg_temp.ok((SELECT count(*) FROM staging.profiles) = 0, 'non-tester sees no staging profiles');
SELECT pg_temp.denied('SELECT 1 FROM staging.reports', 'reports table is RPC-only in staging too');
DO $$ BEGIN
  PERFORM staging.admin_list_reports();
  RAISE EXCEPTION 'FAIL: non-tester listed staging reports';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS: non-tester cannot use the staging admin report list (%)', SQLERRM;
END $$;
DO $$ BEGIN
  INSERT INTO staging.posts (author_id, title, content) VALUES (auth.uid(), 'x', 'x');
  RAISE EXCEPTION 'FAIL: non-tester inserted a staging post';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: non-tester cannot post in staging';
END $$;
DO $$ BEGIN
  INSERT INTO staging.profiles (id, email, name) VALUES (auth.uid(), 'prod.member@school.edu', 'self-enrol');
  RAISE EXCEPTION 'FAIL: non-tester enrolled themselves';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: non-tester cannot self-enrol in staging';
END $$;
SELECT pg_temp.ok(staging.is_admin() = false, 'non-tester is not a staging admin');
SELECT pg_temp.ok((SELECT count(*) FROM public.posts) >= 1, 'same member still sees production posts');
RESET ROLE;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.denied('SELECT 1 FROM staging.posts', 'anon cannot read staging');
RESET ROLE;

-- A staging tester: content stays in staging; production admin rights don't carry over.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
SELECT pg_temp.ok((SELECT count(*) FROM public.posts WHERE author_id = auth.uid()) = 0, 'tester has no production posts before');
INSERT INTO staging.posts (author_id, title, content) VALUES (auth.uid(), 'staging only', 'x');
SELECT pg_temp.ok((SELECT count(*) FROM public.posts WHERE author_id = auth.uid()) = 0, 'tester post went to staging, not production');
RESET ROLE;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'Administrator'
                              AND id IN (SELECT id FROM staging.profiles WHERE role = 'Administrator')),
                  'staging admin is not a production admin');

-- Production auto-approval still runs after the hotfix guard (trigger order).
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'ffffffff-0000-0000-0000-00000000000f', false);
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES ('ffffffff-0000-0000-0000-00000000000f', 'new.student@school.edu');
SET ROLE authenticated;
INSERT INTO public.profiles (id, email, name, role, status) VALUES (auth.uid(), 'new.student@school.edu', 'New', 'Administrator', 'approved');
RESET ROLE;
SELECT pg_temp.ok((SELECT role = 'Current Student' AND status = 'approved' FROM public.profiles WHERE id = 'ffffffff-0000-0000-0000-00000000000f'),
                  'prod: school-email signup auto-approved, Administrator role stripped');
