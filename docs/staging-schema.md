# Staging schema (same Supabase project)

Testing reporting, blocking and admin moderation with real Auth and the
real API, before production. For now staging is a separate **schema**,
`staging`, inside the production project (`blqryjhjwtygafjwxbup`).
Before launch it moves to its own project (see the end of this page).

## What is isolated, and what is not

| Isolated by the schema | **Shared with production** |
|---|---|
| All app tables, data, RLS policies and functions (`staging.*`, `staging_private.*`) | **Auth**: test users are real accounts in the production project |
| Staging admin role: being an Administrator in staging gives no production rights | **public.profiles side effect**: the `handle_new_user` trigger on `auth.users` gives each test user a production profile row (pending, because the emails aren't school addresses) |
| Reports, blocks and moderation history | **Storage** buckets: the app turns uploads off in staging mode |
| | **Realtime** publication, API settings (exposed schemas), rate limits, email sending, project quotas |

Exposing `staging` through the API makes it reachable for every signed-in
production user. Three layers keep it closed:
- A RESTRICTIVE "test accounts only" policy on every staging table: you need a `staging.profiles` row, and only `staging_seed.sql` creates those. No client insert policy exists.
- `anon` has no staging table privileges.
- Admin RPCs check `staging.is_admin()`.

**Remaining gap:** a signed-in non-tester can still call the SECURITY DEFINER RPCs (`submit_report`, `block_author_of`). Without staging ids (random UUIDs) these fail with `not_found`. Accepted for a temporary staging setup.

## Files

| File | Purpose |
|---|---|
| `supabase/staging/build_staging.py` | Generates `staging_schema.sql` from a prod schema-only dump plus the unapplied migrations (hotfix, 000500–000700), renaming `public` → `staging` and `app_private` → `staging_private`. It refuses to write output that names `public.*`, writes to `auth`/`storage`, or changes the Realtime publication. |
| `supabase/staging/staging_schema.sql` | Generated and committed. One transaction. Refuses to run twice. |
| `supabase/staging/staging_seed.sql` | Enrols the 3 test accounts (by email) and adds `[staging]` sample content. Re-runnable. Aborts unless exactly 3 Auth users match. |
| `supabase/staging/staging_teardown.sql` | `DROP SCHEMA staging, staging_private CASCADE`, plus the manual clean-up steps. |
| `supabase/staging/test_local.sh` (+ `test_*.sql`) | Local rehearsal on a copy of the production schema. |
| `.env.staging.local` (git-ignored) | Same URL and anon key as `.env.local`, plus `VITE_SUPABASE_DB_SCHEMA=staging`. |
| `npm run dev:staging` | Runs the app against the staging schema, with an orange STAGING badge, sign-up off and uploads off. |

Regenerate after a new prod dump or migration:

```sh
python supabase/staging/build_staging.py <schema_dump.sql>
```

## Local rehearsal (done, 2026-11-22)

Command: `PGPORT=54329 sh supabase/staging/test_local.sh C:/Users/mjeon/sb_backup/schema_2026-11-22_1501.sql`

- Loads the production public schema (+ hotfix, as on prod), then applies `staging_schema.sql`.
- `public` schema+data fingerprint: identical before and after the staging build, and after all staging scenarios.
- Reporting / blocking / admin scenarios run against `staging`: **101/101**.
- Isolation checks, all passing:
  - A non-tester sees no staging rows, can't post or self-enrol, and can't use the admin RPCs.
  - `anon` is denied.
  - A tester's writes land in staging only.
  - A staging admin is not a production admin.
- Production check: school-email signups are still auto-approved after the hotfix guard (the triggers fire in alphabetical order: `guard_profile_privileges` runs before `set_profile_initial_status`).
- `staging_seed.sql`: 3 approved testers (1 admin) plus sample content. Re-runs cleanly. Placeholder emails abort.

## Approval points (remote, in this order)

| # | Action | Production effect |
|---|---|---|
| S1 | Dashboard → Project Settings → API → **Exposed schemas**: add `staging` | API config change; staging becomes reachable (closed by the gate) |
| S2 | SQL editor: run `staging_schema.sql` | Creates the 2 new schemas only |
| S3 | Dashboard → Authentication → **Add user** ×3 (non-school emails, auto-confirm), owner sets passwords | 3 Auth users + 3 *pending* `public.profiles` rows |
| S4 | SQL editor: run `staging_seed.sql` with those emails | Writes `staging.*` only |
| S5 | *(optional)* `ALTER PUBLICATION supabase_realtime ADD TABLE staging.messages;` | Live chat updates in staging |

Remove everything: run `staging_teardown.sql`, remove `staging` from Exposed schemas, then delete the 3 test users.

## Test plan (User A, User B, Admin)

1. Run `npm run dev:staging`.
2. The owner signs in. Passwords are never handled by Claude. Claude can then drive the browser on the signed-in session.
3. Run the checklist in `docs/reporting-blocking-mvp.md`:
   - **A** reports B's post, comment and listing: success, duplicate, "Something else" needs details, can't report own content.
   - **A** blocks B: B's content disappears for A, and A's disappears for B. Likes, comments, saves and messages across the block are refused. A unblocks.
   - **Admin**:
     - `#/admin/reports`: queue, grouped cases
     - hide → content disappears for A and B
     - restore; remove (with confirm); history
     - `#/admin/blocking`: aggregate stats only, no identities
   - B can't un-hide its own hidden content. A non-admin is redirected away from `#/admin`.
4. Production stays untouched. Check with `select count(*) from public.posts where title like '[staging]%'`, which should return 0.

## Production rollout afterwards (each step needs approval)

Production already has the Oct 24 batch under its old version numbers, plus `20260829000001`, `20260905*` and the hotfix, which were applied by hand (verified 2026-11-22). Reconcile the history instead of re-running:

1. Remove the old-name records and record the equivalents:
   ```sh
   supabase migration repair --status reverted 20260829000100 20260830000000 20261024000000 20261024000100
   supabase migration repair --status applied 20260829000001 20260905000000 20260905000001 20260905000002 \
     20261120000000 20261121000000 20261121000100 20261121000200 20261121000300 20261121000400
   ```
   `20260829000000` stays recorded. The version matches the reveal-RPC file.
2. `supabase db push --dry-run`. It must list only `000500`, `000600` and `000700`. Then run `supabase db push`.
3. Push `main` to GitHub. Vercel deploys Production, including email login and the reporting UI.
4. After a real login on the new frontend works, apply `20261122000000_revoke_username_email_lookup.sql`.

`--linked` CLI commands initialise a temporary CLI login role on the project. Otherwise the owner runs them with the DB password.

## Later: moving staging to its own project

1. Create the project and apply all migrations in `supabase/migrations`. For an exact copy of today's prod schema instead, restore a fresh schema-only dump (prod has objects outside the migrations, such as `set_profile_initial_status` and the `posts` tables).
2. Re-create the test users there and run `staging_seed.sql` with `staging.` replaced by `public.`. Or keep a project-agnostic seed: the seed is plain SQL against the app tables.
3. Point `.env.staging.local` at the new URL and key, and remove `VITE_SUPABASE_DB_SCHEMA`. The app code needs no other change.
4. In production, run `staging_teardown.sql`, remove `staging` from Exposed schemas, and delete the 3 test users.

## Applied and tested — 2026-11-22

- **S1–S4**:
  - The owner ran S2 and S4 through `supabase/staging/apply_staging.ps1`.
  - Both runs: production `public` schema fingerprint and every row count unchanged.
  - Result: 18 staging tables, all 18 gated.
  - Then S1: `staging` exposed. Anon gets 401 on staging and on public.
  - Then S3: 3 test users (`test1`/`test2`/`test3@test.com` = A/B/Admin).
- **UI on `npm run dev:staging`** (owner signed in; Claude drove the browser):
  - **A**:
    - Reported B's post, comment and listing.
    - A second report on the same item shows "Already reported".
    - "Something else" needs details.
    - Own post has no Report or Block.
    - Blocked B from a listing: B's post, listing and event disappeared at once. Unblocking brought them back.
  - **B**: A's post and comments are hidden (symmetric). Nothing shows that B was reported or blocked.
  - **Admin**:
    - The queue shows the 3 cases, by alias only.
    - Hide & resolve with a note works, then restore works. Both appear in the audit history, and the button positions stay stable.
    - The Blocking tab shows aggregates only (1 block, from a listing).
    - Counts reflect staging data only.
- **Not exercised in the UI** (covered by the local SQL suite):
  - Hidden content disappearing for A/B
  - Remove (irreversible)
  - Interactions across a block
- **Small bug**: after "Restore" without a note, the decision record still shows the previous decision's note. The audit history itself is correct.
