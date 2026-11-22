-- Reporting + blocking scenarios. Run as postgres after all migrations.
-- Each check prints PASS or raises (ON_ERROR_STOP) so a failure stops the run.
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

-- ---------- helpers (callable by test roles) -----------------------
CREATE OR REPLACE FUNCTION public.t_ok(cond BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
-- Runs `stmt`; passes only if it raises an error whose message contains `expected`.
CREATE OR REPLACE FUNCTION public.t_err(stmt TEXT, expected TEXT, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF position(expected IN SQLERRM) > 0 THEN
      RAISE NOTICE 'PASS: % (%)', label, SQLERRM; RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL: % — got error "%", wanted "%"', label, SQLERRM, expected;
  END;
  RAISE EXCEPTION 'FAIL: % — no error, wanted "%"', label, expected;
END $$;
GRANT EXECUTE ON FUNCTION public.t_ok(BOOLEAN, TEXT), public.t_err(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ---------- fixtures (as postgres, bypassing RLS) -----------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@school.edu', '{"name":"Alice Real"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@school.edu', '{"name":"Bob Real"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@school.edu', '{"name":"Cara Real"}'),
  ('dddddddd-0000-0000-0000-000000000004', 'admin@school.edu', '{"name":"Admin Real"}');
UPDATE public.profiles SET status = 'approved';
UPDATE public.profiles SET role = 'Administrator' WHERE id = 'dddddddd-0000-0000-0000-000000000004';

INSERT INTO public.posts (id, title, content, author_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', 'A post', 'hello from A', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000b', 'B post', 'hello from B', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-0000000000b2', 'B post 2', 'more from B', 'bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.post_comments (id, post_id, author_id, text) VALUES
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'B comments on A'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-000000000003', 'C comments on A');
INSERT INTO public.marketplace_items (id, title, category, price, condition, description, seller_id) VALUES
  ('30000000-0000-0000-0000-00000000000b', 'B lamp', 'Home', 10, 'Good', 'a lamp', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-00000000000a', 'A desk', 'Home', 20, 'Good', 'a desk', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.marketplace_comments (id, item_id, author_id, text) VALUES
  ('40000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'B asks about A desk');
INSERT INTO public.events (id, title, date, time, venue, description, author_id) VALUES
  ('50000000-0000-0000-0000-00000000000b', 'B party', current_date + 7, '7pm', 'Hall', 'party', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-00000000000a', 'A talk', current_date + 7, '5pm', 'Room', 'talk', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.event_comments (id, event_id, author_id, text) VALUES
  ('60000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'B on A talk');
-- A pre-existing A<->B conversation (made before any block).
INSERT INTO public.conversations (id) VALUES ('70000000-0000-0000-0000-000000000001');
INSERT INTO public.conversation_participants (conversation_id, user_id, user_name) VALUES
  ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Anonymous Buyer'),
  ('70000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Anonymous Seller');
INSERT INTO public.messages (conversation_id, sender_id, sender_name, content) VALUES
  ('70000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Anonymous Seller', 'still available');

\echo '=== Reporting: User A ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

SELECT t_ok(submit_report('post', '10000000-0000-0000-0000-00000000000b', 'spam', NULL) = 'created', 'A reports B post');
SELECT t_ok(submit_report('post', '10000000-0000-0000-0000-00000000000b', 'hate', 'again') = 'duplicate', 'second open report is a duplicate');
SELECT t_err($$SELECT submit_report('post', '10000000-0000-0000-0000-00000000000a', 'spam')$$, 'cannot_report_own', 'cannot report own post');
SELECT t_err($$SELECT submit_report('post', '10000000-0000-0000-0000-0000000000b2', 'nope')$$, 'invalid_reason', 'invalid reason rejected');
SELECT t_err($$SELECT submit_report('post', '10000000-0000-0000-0000-0000000000b2', 'other', '   ')$$, 'details_required', '"other" needs details');
SELECT t_err(format('SELECT submit_report(%L, %L, %L, %L)', 'post', '10000000-0000-0000-0000-0000000000b2', 'spam', repeat('x', 501)), 'details_too_long', 'details over 500 chars rejected');
SELECT t_err($$SELECT submit_report('profile', '10000000-0000-0000-0000-0000000000b2', 'spam')$$, 'invalid_target', 'unknown target type rejected');
SELECT t_err($$SELECT submit_report('post', gen_random_uuid(), 'spam')$$, 'not_found', 'missing content rejected');
SELECT t_ok(submit_report('post_comment', '20000000-0000-0000-0000-00000000000b', 'harassment') = 'created', 'A reports B post comment');
SELECT t_ok(submit_report('marketplace_item', '30000000-0000-0000-0000-00000000000b', 'spam') = 'created', 'A reports B listing');
SELECT t_ok(submit_report('marketplace_comment', '40000000-0000-0000-0000-00000000000b', 'spam') = 'created', 'A reports B listing comment');
SELECT t_ok(submit_report('event', '50000000-0000-0000-0000-00000000000b', 'violence_or_threat') = 'created', 'A reports B event');
SELECT t_ok(submit_report('event_comment', '60000000-0000-0000-0000-00000000000b', 'other', 'rude') = 'created', 'A reports B event comment');
SELECT t_err($$SELECT * FROM reports$$, 'permission denied', 'A cannot read reports table');
SELECT t_err($$INSERT INTO reports (target_type, target_id, reason, content_snapshot) VALUES ('post', gen_random_uuid(), 'spam', '{}')$$, 'permission denied', 'A cannot insert into reports directly');
SELECT t_err($$SELECT * FROM moderation_actions$$, 'permission denied', 'A cannot read audit log');
SELECT t_err($$SELECT * FROM admin_list_reports()$$, 'forbidden', 'A cannot list reports');
SELECT t_err($$SELECT admin_moderate_reports(ARRAY[gen_random_uuid()], 'dismissed')$$, 'forbidden', 'A cannot moderate');
SELECT t_err($$SELECT * FROM app_private.content_target('post', '10000000-0000-0000-0000-00000000000b')$$, 'permission denied', 'A cannot call internal content_target');
RESET ROLE;

\echo '=== Reporting: anon ==='
SET ROLE anon;
SELECT t_err($$SELECT submit_report('post', '10000000-0000-0000-0000-00000000000b', 'spam')$$, 'permission denied', 'anon cannot submit');
SELECT t_err($$SELECT * FROM admin_list_reports()$$, 'permission denied', 'anon cannot list');
RESET ROLE;

\echo '=== Moderation: Admin ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
SELECT t_ok((SELECT count(*) FROM admin_list_reports()) = 6, 'admin sees all 6 reports');
SELECT t_ok((SELECT count(*) FROM admin_list_reports('pending')) = 6, 'status filter: pending');
SELECT t_ok((SELECT count(*) FROM admin_list_reports('resolved')) = 0, 'status filter: resolved');
SELECT t_ok(NOT EXISTS (
  SELECT 1 FROM admin_list_reports() r
   WHERE r::text ILIKE '%bbbbbbbb%' OR r::text ILIKE '%aaaaaaaa%' OR r::text ILIKE '%Real%' OR r::text ILIKE '%@school%'
), 'admin list exposes no user ids, names or emails');
SELECT t_ok((SELECT live_content->>'parent_title' FROM admin_list_reports() WHERE target_type = 'post_comment') = 'A post', 'comment report carries parent context');

-- under review, then hide the post
SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'post'), 'under_review');
SELECT t_ok((SELECT status FROM admin_list_reports() WHERE target_type = 'post') = 'under_review', 'post report moved to under_review');
SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'post'), 'resolved', 'hide', 'spam link');
SELECT t_ok((SELECT target_hidden AND status = 'resolved' AND action_taken = 'hidden' AND moderator_note = 'spam link'
               FROM admin_list_reports() WHERE target_type = 'post'), 'hide + resolve persisted with note');
SELECT t_ok(EXISTS (SELECT 1 FROM posts WHERE id = '10000000-0000-0000-0000-00000000000b'), 'admin still sees hidden post');
-- hide a comment
SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'post_comment'), 'resolved', 'hide');
-- remove the listing
SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'marketplace_item'), 'resolved', 'remove');
SELECT t_ok((SELECT NOT target_exists AND content_snapshot->>'title' = 'B lamp'
               FROM admin_list_reports() WHERE target_type = 'marketplace_item'), 'removed listing keeps its snapshot');
SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'event'), 'dismissed', 'none', 'not a threat');
SELECT t_ok((SELECT status = 'dismissed' AND action_taken = 'none' FROM admin_list_reports() WHERE target_type = 'event'), 'dismiss persisted');
SELECT t_err($$SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type IN ('event', 'event_comment')), 'resolved')$$,
             'reports_must_share_one_target', 'reports about different targets rejected');
SELECT t_err($$SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'event'), 'closed')$$, 'invalid_status', 'invalid status rejected');
SELECT t_err($$SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'event'), 'resolved', 'ban')$$, 'invalid_action', 'invalid action rejected');
RESET ROLE;
SELECT t_ok((SELECT count(*) FROM moderation_actions) = 5, 'every decision wrote an audit row');
SELECT t_ok((SELECT bool_and(actor_id = 'dddddddd-0000-0000-0000-000000000004') FROM moderation_actions), 'audit rows record the acting admin');

\echo '=== Hidden content visibility ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
SELECT t_ok(NOT EXISTS (SELECT 1 FROM posts WHERE id = '10000000-0000-0000-0000-00000000000b'), 'C cannot see hidden post');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM post_comments WHERE id = '20000000-0000-0000-0000-00000000000b'), 'C cannot see hidden comment');
SELECT t_err($$SELECT submit_report('post', '10000000-0000-0000-0000-00000000000b', 'spam')$$, 'not_found', 'hidden post is not reportable');
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
SELECT t_ok(EXISTS (SELECT 1 FROM posts WHERE id = '10000000-0000-0000-0000-00000000000b'), 'author B still sees own hidden post');
SELECT t_err($$UPDATE posts SET hidden_at = NULL WHERE id = '10000000-0000-0000-0000-00000000000b'$$, 'hidden_at_admin_only', 'author cannot un-hide own moderated post');
UPDATE posts SET content = 'edited by B' WHERE id = '10000000-0000-0000-0000-00000000000b';
SELECT t_ok((SELECT content FROM posts WHERE id = '10000000-0000-0000-0000-00000000000b') = 'edited by B', 'author can still edit other fields');
INSERT INTO posts (title, content, author_id, hidden_at) VALUES ('sneaky', 'x', 'bbbbbbbb-0000-0000-0000-000000000002', now());
SELECT t_ok((SELECT hidden_at IS NULL FROM posts WHERE title = 'sneaky'), 'hidden_at cannot be set on insert');
RESET ROLE;
-- Admin restores the comment (unhide)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
SELECT admin_moderate_reports(ARRAY(SELECT id FROM admin_list_reports() WHERE target_type = 'post_comment'), 'resolved', 'unhide');
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
SELECT t_ok(EXISTS (SELECT 1 FROM post_comments WHERE id = '20000000-0000-0000-0000-00000000000b'), 'restored comment visible again');
RESET ROLE;

\echo '=== Blocking: A blocks B ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
SELECT t_ok((SELECT count(*) FROM posts WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 2, 'before block: A sees B''s visible posts');
SELECT t_ok(block_author_of('post_comment', '20000000-0000-0000-0000-00000000000b', 'Brave Otter') = 'blocked', 'A blocks the author of a comment');
SELECT t_ok(block_author_of('event', '50000000-0000-0000-0000-00000000000b') = 'already_blocked', 'blocking the same person again is idempotent');
SELECT t_err($$SELECT block_author_of('post', '10000000-0000-0000-0000-00000000000a')$$, 'cannot_block_self', 'cannot block yourself');
SELECT t_err($$SELECT block_author_of('profile', gen_random_uuid())$$, 'invalid_target', 'unknown type rejected');
SELECT t_err($$SELECT block_author_of('post', gen_random_uuid())$$, 'not_found', 'missing content rejected');
SELECT t_ok((SELECT count(*) FROM list_my_blocks()) = 1 AND (SELECT source_alias FROM list_my_blocks()) = 'Brave Otter', 'A''s block list shows the alias');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM list_my_blocks() b WHERE b::text ILIKE '%bbbbbbbb%'), 'block list exposes no user id');
SELECT t_err($$SELECT * FROM user_blocks$$, 'permission denied', 'A cannot read user_blocks directly');
SELECT t_err($$INSERT INTO user_blocks (blocker_id, blocked_id, source_type) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'post')$$, 'permission denied', 'A cannot write user_blocks directly');

SELECT t_ok(NOT EXISTS (SELECT 1 FROM posts WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'A no longer sees B''s posts');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM post_comments WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'A no longer sees B''s post comments');
SELECT t_ok(EXISTS (SELECT 1 FROM post_comments WHERE author_id = 'cccccccc-0000-0000-0000-000000000003'), 'A still sees C''s comments');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM marketplace_comments WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'A no longer sees B''s listing comments');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM events WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'A no longer sees B''s events');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM event_comments WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'A no longer sees B''s event comments');
SELECT t_ok(EXISTS (SELECT 1 FROM posts WHERE author_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A still sees own posts');
SELECT t_err($$INSERT INTO post_likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'row-level security', 'A cannot like B''s post');
SELECT t_err($$INSERT INTO post_comments (post_id, author_id, text) VALUES ('10000000-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-000000000001', 'hi')$$, 'row-level security', 'A cannot comment on B''s post');
SELECT t_err($$INSERT INTO event_rsvps (event_id, user_id) VALUES ('50000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'row-level security', 'A cannot RSVP to B''s event');
SELECT t_err($$INSERT INTO event_likes (event_id, user_id) VALUES ('50000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'row-level security', 'A cannot like B''s event');
SELECT t_err($$INSERT INTO event_comments (event_id, author_id, text) VALUES ('50000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'hi')$$, 'row-level security', 'A cannot comment on B''s event');
SELECT t_ok((SELECT count(*) FROM messages WHERE conversation_id = '70000000-0000-0000-0000-000000000001') = 1, 'A can still read existing conversation history');
SELECT t_err($$INSERT INTO messages (conversation_id, sender_id, sender_name, content) VALUES ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'hello?')$$, 'row-level security', 'A cannot send in the existing A-B conversation');
INSERT INTO conversations (id) VALUES ('70000000-0000-0000-0000-000000000002');
INSERT INTO conversation_participants (conversation_id, user_id, user_name) VALUES ('70000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'me');
SELECT t_err($$INSERT INTO conversation_participants (conversation_id, user_id, user_name) VALUES ('70000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'them')$$, 'row-level security', 'A cannot start a new conversation with B');
INSERT INTO conversation_participants (conversation_id, user_id, user_name) VALUES ('70000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'them');
SELECT t_ok(true, 'A can still start a conversation with C');

\echo '=== Blocking: B view (symmetric) ==='
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
SELECT t_ok(NOT EXISTS (SELECT 1 FROM posts WHERE author_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'B no longer sees A''s posts');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM marketplace_items WHERE seller_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'B no longer sees A''s listings');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM events WHERE author_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'B no longer sees A''s events');
SELECT t_err($$INSERT INTO marketplace_saves (item_id, user_id) VALUES ('30000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002')$$, 'row-level security', 'B cannot save A''s listing');
SELECT t_err($$INSERT INTO marketplace_comments (item_id, author_id, text) VALUES ('30000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'hi')$$, 'row-level security', 'B cannot comment on A''s listing');
SELECT t_err($$INSERT INTO post_likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002')$$, 'row-level security', 'B cannot like A''s post');
SELECT t_ok((SELECT count(*) FROM list_my_blocks()) = 0, 'B''s block list is empty (B is not told)');
RESET ROLE;
SELECT id AS a_block_id FROM user_blocks WHERE blocker_id = 'aaaaaaaa-0000-0000-0000-000000000001' \gset
SET ROLE authenticated;
SELECT t_ok(NOT unblock(:'a_block_id'), 'B cannot remove A''s block');

\echo '=== Bystander C and Admin ==='
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
SELECT t_ok((SELECT count(DISTINCT author_id) FROM posts) = 2, 'C still sees both A''s and B''s posts');
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
SELECT t_ok((SELECT count(*) FROM post_comments) = 2, 'admin sees all comments');

\echo '=== Unblock ==='
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
SELECT t_ok(unblock(:'a_block_id'), 'A unblocks B');
SELECT t_ok(EXISTS (SELECT 1 FROM post_comments WHERE author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'B''s comments visible to A again');
INSERT INTO post_likes (post_id, user_id) VALUES ('10000000-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-000000000001');
SELECT t_ok(true, 'A can like B''s post again');
INSERT INTO messages (conversation_id, sender_id, sender_name, content) VALUES ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'back');
SELECT t_ok(true, 'A can message B again');
RESET ROLE;
SET ROLE anon;
SELECT t_err($$SELECT block_author_of('post', '10000000-0000-0000-0000-00000000000b')$$, 'permission denied', 'anon cannot block');
SELECT t_err($$SELECT * FROM list_my_blocks()$$, 'permission denied', 'anon cannot list blocks');
RESET ROLE;

\echo '=== Rate limit ==='
INSERT INTO posts (title, content, author_id)
SELECT 'bulk ' || lpad(g::text, 2, '0'), 'x', 'bbbbbbbb-0000-0000-0000-000000000002' FROM generate_series(1, 25) g;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
SELECT count(*) FILTER (WHERE submit_report('post', id, 'spam') = 'created') AS made
  FROM (SELECT id FROM posts WHERE title LIKE 'bulk %' ORDER BY title LIMIT 20) s \gset
SELECT t_ok(:made = 20, '20 reports accepted in 24h');
SELECT t_err($$SELECT submit_report('post', (SELECT id FROM posts WHERE title = 'bulk 21'), 'spam')$$, 'rate_limited', '21st report in 24h is rate limited');
RESET ROLE;
\echo 'ALL SCENARIOS PASSED'
