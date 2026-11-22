-- =============================================================
-- Staging seed: enrol the three test accounts and add sample content.
-- Run AFTER staging_schema.sql, in the SQL editor (needs approval).
--
-- Before running:
--   1. Create three Auth users (Dashboard > Authentication > Add user,
--      "Auto Confirm User" on). Use NON-school addresses so production
--      keeps them "pending" (production auto-approves school emails).
--      Note: the shared handle_new_user trigger also creates a pending
--      row for each in public.profiles. That is the only production-side
--      effect; staging_teardown.sql lists how to remove it.
--   2. Put their emails in the VALUES list below.
--
-- Reads auth.users only to look up those ids. Writes only to staging.*.
-- Re-runnable: profiles are upserted, sample content is only added once.
-- =============================================================

SET client_encoding = 'UTF8';
BEGIN;

CREATE TEMP TABLE staging_testers (email text, label text, role text, username text) ON COMMIT DROP;
INSERT INTO staging_testers VALUES
  ('REPLACE-user-a@example.com', 'Staging User A', 'Current Student', 'stagingusera'),
  ('REPLACE-user-b@example.com', 'Staging User B', 'Current Student', 'staginguserb'),
  ('REPLACE-admin@example.com',  'Staging Admin',  'Administrator',   'stagingadmin');

DO $$
DECLARE found int;
BEGIN
  SELECT count(*) INTO found
  FROM auth.users u JOIN staging_testers t ON lower(u.email) = lower(t.email);
  IF found <> 3 THEN
    RAISE EXCEPTION 'expected 3 matching Auth users, found % (create them first and fill in the emails)', found;
  END IF;
END $$;

INSERT INTO staging.profiles (id, email, name, username, role, department, status, verified)
SELECT u.id, lower(u.email), t.label, t.username, t.role, 'Staging', 'approved', true
FROM auth.users u JOIN staging_testers t ON lower(u.email) = lower(t.email)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

-- The copied set_profile_initial_status trigger marks non-school emails
-- pending on insert; staging testers are always approved.
UPDATE staging.profiles p SET status = 'approved', verified = true
FROM auth.users u JOIN staging_testers t ON lower(u.email) = lower(t.email)
WHERE p.id = u.id;

-- Sample content, once.
DO $$
DECLARE
  a uuid; b uuid; post_b uuid; item_b uuid; event_b uuid;
BEGIN
  SELECT u.id INTO a FROM auth.users u JOIN staging_testers t ON lower(u.email) = lower(t.email) WHERE t.label = 'Staging User A';
  SELECT u.id INTO b FROM auth.users u JOIN staging_testers t ON lower(u.email) = lower(t.email) WHERE t.label = 'Staging User B';
  IF EXISTS (SELECT 1 FROM staging.posts) THEN
    RAISE NOTICE 'staging already has content; sample content not added again';
    RETURN;
  END IF;

  INSERT INTO staging.posts (author_id, title, content, category)
  VALUES (a, '[staging] Hello from User A', 'Sample post by User A.', 'General');
  INSERT INTO staging.posts (author_id, title, content, category)
  VALUES (b, '[staging] Post by User B (report me)', 'Sample post by User B for reporting tests.', 'General')
  RETURNING id INTO post_b;
  INSERT INTO staging.post_comments (post_id, author_id, text) VALUES (post_b, a, '[staging] Comment by A');
  INSERT INTO staging.post_comments (post_id, author_id, text) VALUES (post_b, b, '[staging] Comment by B');

  INSERT INTO staging.marketplace_items (seller_id, title, description, price, category, condition, contact)
  VALUES (b, '[staging] Desk lamp', 'Sample listing by User B.', 5, 'Other', 'Good', 'Message me in the app')
  RETURNING id INTO item_b;
  INSERT INTO staging.marketplace_comments (item_id, author_id, text) VALUES (item_b, a, '[staging] Is this available?');

  INSERT INTO staging.events (author_id, title, date, "time", venue, description)
  VALUES (b, '[staging] Study group', CURRENT_DATE + 7, '18:00', 'Library', 'Sample event by User B.')
  RETURNING id INTO event_b;
  INSERT INTO staging.event_comments (event_id, author_id, text) VALUES (event_b, a, '[staging] Count me in');
END $$;

COMMIT;

-- Check: expect 3 approved testers, 1 Administrator.
SELECT name, role, status FROM staging.profiles ORDER BY name;
