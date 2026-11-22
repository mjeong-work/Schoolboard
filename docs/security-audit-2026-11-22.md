# Supabase security audit — 2026-11-22

Production project: `blqryjhjwtygafjwxbup`. Nothing below has been applied there.

## How production was inspected (read-only)

- `supabase gen types --linked`: tables and RPCs in `public`. The CLI printed
  "Initialising login role…", so it set up its temporary CLI login role on
  the project. No schema or data change. No other DB-connected command was run.
- `supabase backups list`: PITR is off and there are no backup timestamps.
- Anon-key requests: `HEAD … count=exact` row counts, plus RPC calls with a
  made-up username. No rows were read.
- Not visible without SQL access: `pg_policies` and
  `supabase_migrations.schema_migrations`. See "Verification SQL" below.

## Findings

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 1 | Critical | Any signed-in user can make themselves `Administrator`. Two routes: an own-profile `UPDATE` (the policy has no column limits), or `role` in the signup metadata, which `handle_new_user` copies. `is_admin()` only checks `role`, so this also unlocks `admin_reveal_*`, which shows real identities. | Reproduced locally (Postgres 17, repo migrations). Not tested on prod; the policies there come from the same files. |
| 2 | High | Signed-out visitors can read `posts` (14), `post_comments` (9), `post_likes` (8), `marketplace_items` (11, including `contact` and location) and `marketplace_saves` (6). | Anon row counts on prod. The repo policies require `auth.uid() IS NOT NULL`, so prod has extra policies that aren't in the repo (drift). |
| 3 | High | The "authenticated users can view all profiles" policy is very likely live, so every member can read every member's real name, email and username. With `author_id` on posts, that breaks anonymity. | Created by the old `20260829000000_marketplace_hardening`. The rest of that batch is live (its columns, buckets and backup tables exist). Confirm with the SQL below. |
| 4 | High | `_backup_20261024_*` tables (base64 image copies, 3 / 7 / 1 rows) are readable with the public anon key. | Anon counts on prod. |
| 5 | Medium | `get_email_by_username` is callable by anyone, so any known or guessed username can be turned into an email address. | Anon RPC returned 200. Login depends on it. Product decision needed. |
| 6 | Data loss | Re-running `20261121000300` on prod would null base64 images posted since Oct 24 without backing them up (`CREATE TABLE IF NOT EXISTS` copies nothing). The prod frontend still saves base64 images. | **Fixed in this commit**: the migration now appends unseen rows to the backups. Tested locally. |
| 7 | Process | Version collision. Prod ran the Oct 24 batch as `20260829000000…20261024000100`; `20260829000000` is also `add_admin_author_reveal_rpc`. Tables like `posts` were created outside migrations. | `db push` needs `migration repair` first, and a staging copy must come from a prod schema dump, not from the migrations folder. |

## Fix prepared (file only, unapplied)

`supabase/migrations/20261120000000_security_hotfix.sql` is standalone and idempotent. It fixes findings 1–4:

- A trigger on `profiles` blocks non-admins from:
  - changing a role to or from `Administrator`
  - changing `status`, `verified` or `email`

  New profiles from signup or client insert always start as `pending` and unverified, and never as `Administrator`.
- It drops the profiles read-all policy.
- It revokes all table privileges from `anon`. The app only loads data after sign-in, and the login RPCs keep working.
- It locks the backup tables (RLS on, revoked from `anon` and `authenticated`).

Local results on a simulated production schema (drift policies + read-all policy + public backup table), applied twice:

| Check | Before | After |
|---|---|---|
| A sets own role to Administrator | succeeds | denied |
| A changes own status | succeeds | denied |
| A edits name / department / role (non-admin values) | ok | ok |
| Signup with `role: Administrator` metadata | becomes admin | `Current Student`, pending |
| Client insert of an approved Administrator profile | succeeds | coerced to pending student |
| Admin approves a user / reads all profiles | ok | ok |
| SQL editor promotes a user | ok | ok |
| A reads other members' profiles | 2 rows | 0 |
| anon reads posts / listings / backup | readable | permission denied |
| anon login RPC | works | works |

The full suite (`run_local.sh`, all migrations including the hotfix) passes 101/101.

**Rollback:**

```sql
DROP TRIGGER guard_profile_privileges ON public.profiles;
DROP FUNCTION app_private.guard_profile_privileges();
```

Restoring anon grants or the profiles policy would re-open the leaks. If it's ever needed, restore them from the dump taken in step 1.

## Verification SQL (read-only; run in the prod SQL editor)

```sql
-- applied migration versions
select version, name from supabase_migrations.schema_migrations order by version;
-- every policy on the affected tables
select tablename, policyname, cmd, roles, qual from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','posts','post_comments','post_likes','marketplace_items','marketplace_saves')
order by 1, 2;
-- admins: ids and dates only, to spot self-promoted accounts
select id, created_at, status from public.profiles where role = 'Administrator' order by created_at;
-- base64 images that 000300 would move
select (select count(*) from posts where image_url like 'data:%') posts,
       (select count(*) from events where image_url like 'data:%') events,
       (select count(*) from marketplace_items where image_url like 'data:%'
          or exists (select 1 from unnest(images) i where i like 'data:%')) items;
```

## Test environment

There is no Docker on this machine, so the local Supabase stack (`supabase start`) is unavailable. Recommended setup:

1. **Local Postgres harness (already here)**: SQL logic and RLS, in seconds (`supabase/tests/run_local.sh`).
2. **A separate staging Supabase project** for real Auth, PostgREST and the UI:
   - Build it from a **schema-only** dump of prod, because of the drift and the tables created outside the migrations. Don't copy user data.
   - Point a local `.env.staging` at it and run `npm run dev -- --mode staging`.
   - The free plan allows 2 active projects, so pausing an unused one may be needed.

Supabase Branching needs a paid plan and is built from migrations, so it would miss the drift.

## Plan

Each production step needs explicit approval.

0. Run the verification SQL above (read-only) and share the results.
1. Back up prod: `supabase db dump -f prod_schema.sql` and `supabase db dump --data-only -f prod_data.sql`, run by the owner with the DB password. Store the dumps outside the repo.
2. Staging: create the project, restore the schema-only dump, and apply the hotfix. Test as User A, User B and Admin:
   - A can't escalate.
   - A can edit their profile.
   - Admin can approve and reject.
   - Signed out, A sees nothing.
   - Login still works.
3. **Prod hotfix (approval):** run `20261120000000_security_hotfix.sql` in the SQL editor. Re-run the anon probe; expect 401/403 on all tables. Sign in as a normal user and an admin.
4. Review the admin list from step 0 and demote any account that shouldn't be admin (approval).
5. Decide on `get_email_by_username`: email-only login, or a server-side username login (Edge Function) that never returns the email.
6. Reconcile migration history on prod (approval):
   - `migration repair --status applied 20261120000000`
   - `migration repair --status reverted` for the old Oct 24 versions, then re-run `20261121000000..000400`. They are idempotent, and `000300` now backs up first.
   - Watch the `20260829000000` collision: keep it as applied for the reveal RPC.
7. Staging: apply `000500`–`000700` and run the reporting/blocking/admin checklist in `docs/reporting-blocking-mvp.md` with User A, User B and Admin.
8. Prod (approval): apply `000500`–`000700`, then deploy the frontend (push main → Vercel). The frontend shows "not available yet" until the migrations exist, so the order is DB first, frontend second.
