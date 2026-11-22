# Backup & Deployment Environment Review (Week 1)

**Method:** read-only. Sources: repo files, `git fetch` of `origin`, Vercel API (deployments list and env-var *names/targets* only, no values decrypted). No Supabase dashboard or Management API access was available. Anything that depends on it is marked **UNVERIFIED**. No secrets are reproduced here.

## 1. Current infrastructure

| Layer | What | Evidence |
|---|---|---|
| Frontend | Vite + React SPA, static build to `build/`, SPA rewrite in `vercel.json` | repo |
| Hosting | Vercel project `schoolboard`, Git-connected to `github.com/mjeong-work/Schoolboard`. **Production = `main` branch.** | Vercel deployments API |
| Database | Supabase Postgres 17 (single linked project) | `supabase/.temp/*` |
| Auth | Supabase Auth (email/password, username→email RPC, admin approval via `profiles.status`) | `authContext.tsx` |
| File storage | Supabase Storage public buckets: `avatars`, `post-images`, `event-images`, `marketplace-images` | migrations |
| Chat | Supabase tables `conversations`, `conversation_participants`, `messages` | migrations |
| CI | None. No `.github/`, no test/lint scripts. Vercel builds on push. | repo |

## 2. Confirmed backup coverage

| Asset | Backed up? | Notes |
|---|---|---|
| Postgres data | **UNVERIFIED** | Depends on the Supabase plan. Free plan has no downloadable backups. Pro has daily backups (7-day retention). PITR is a paid add-on. Check Dashboard → Database → Backups. |
| Storage files (images) | **No (by platform design)** | Supabase DB backups cover the `storage.objects` *metadata rows* only, not the file bytes. No separate copy of bucket contents exists. |
| Schema | **Partial** | 17 migrations in git, but **`posts`, `post_likes`, `post_comments`, `profiles` base table, `post_history`, `increment_marketplace_views`, `get_email_by_username`, `handle_new_user` trigger are not in any migration**. Some live only in `public/*.sql` snippets or were created in the dashboard. You can't rebuild the DB from the repo. |
| Auth config | **No** | No `supabase/config.toml`. Site URL, redirect URLs, email templates, SMTP, and email-confirmation settings live only in the dashboard. |
| Auth users | Same as Postgres (`auth.users` is in the DB backup, if one exists) | UNVERIFIED |
| Env vars | Vercel holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for Production + Development | Vercel API |
| Ad-hoc | `_backup_20261024_*` tables (base64-image snapshots) in the `public` schema | migration `20261024000000` (applied? UNVERIFIED) |

## 3. Environments

- **Dev and prod share one Supabase project (likely).** `.env.local` points at the same project ref the CLI is linked to. The Vercel Production values are "sensitive" (unreadable), so a match with prod can't be proven. **UNVERIFIED, but no second Supabase project exists anywhere in the repo.** So local `npm run dev`, testing, and migrations all hit live user data.
- **No Preview env vars** in Vercel. Preview deployments of feature branches would build with an empty Supabase URL/key.
- **`VITE_GOOGLE_MAPS_API_KEY` is not set in Vercel**, though `useGoogleMaps.ts` reads it. Map/location features are likely broken in production. UNVERIFIED in browser.
- Branch drift: `main` (production) has 5 commits (Jiho's anonymity PR, reveal RPC, events fix) that `supabase-integration` lacks. `supabase-integration` holds large **uncommitted** work (Oct 24 optimization and this week's fixes). It exists only on one laptop.

## 4. Deployments & rollback

- Deploy = push/merge to `main`, then Vercel builds. Last 3 production deploys are READY. The latest 2 are rollback candidates (Vercel Instant Rollback works for frontend).
- Earlier deploys from `supabase-integration` show state `BLOCKED`.
- **DB has no rollback path.** Migrations are forward-only, there are no down-migrations, and `supabase db push` is run manually from a laptop. A frontend rollback after a schema change can leave the old frontend incompatible with the new schema.
- **Migration version collision:** `20260829000000_add_admin_author_reveal_rpc.sql` (main) and `20260829000000_marketplace_hardening.sql` (local, untracked) share a version. `supabase db push` keys on version, so one would be skipped or fail after merge.

## 5. Risks

| Sev | Risk |
|---|---|
| P0 | ~25 files of uncommitted work (Oct 24 + Week 1) exist only in one working tree. A disk loss or bad `git checkout` loses it. |
| P0 | `supabase-integration` predates `main`'s anonymity PR. Deploying it as-is would re-expose real names. It must be merged, not fast-forwarded. |
| P0 | Migration version collision (§4). |
| P0 | Any authenticated user can `SELECT` every `profiles` row incl. email (`marketplace_hardening` policy), and all content payloads include `author_id`. That de-anonymizes users. |
| P1 | `_backup_20261024_*` tables were created in `public` with no `ENABLE ROW LEVEL SECURITY`. With Supabase's default grants they may be readable via the REST API. UNVERIFIED: check the table's RLS status in the dashboard. |
| P1 | No verified DB backup, no storage backup, schema not reproducible, auth config not captured. |
| P1 | Shared dev/prod database. |
| P2 | `public/supabase-test.html` (hardcoded anon key; the anon key is public by design, but it's a debug page) and `public/*.sql` schema files are deployed to the production site. `my-app.zip` (old source copy) is committed. |
| P2 | `supabase/.temp/` (project ref, pooler host) is committed. No password in it, but it should be gitignored. |

## 6. Minimum backup strategy before launch

1. **Today:** commit + push the `supabase-integration` work to the remote (its own branch). Zero-risk, removes the single-copy risk.
2. Confirm the Supabase plan. For launch, use **Pro with daily backups**, and **enable PITR** if budget allows.
3. Weekly logical dump to storage outside Supabase: `supabase db dump --data-only` + `supabase db dump` (schema) + `--role-only`. Keep 4 weekly + 3 monthly copies, encrypted.
4. Storage: weekly sync of the 4 buckets to an external bucket (e.g. `rclone` with the S3-compatible endpoint), keeping versions.
5. Capture the full schema into the repo: `supabase db pull` into a baseline migration so `posts`, `post_likes`, triggers, and RPCs are version-controlled.
6. Export auth settings (`supabase/config.toml` via `supabase init` + manual copy of dashboard settings, or Management API) into the repo, with no secrets.
7. **Test a restore once** into a scratch project before launch and record the time it took.

## 7. Recovery & rollback recommendations

- Create a **separate staging Supabase project**. Point Vercel Preview + local dev at it, and keep prod keys in Vercel Production only.
- Migrations: apply to staging first, then prod. Make each migration backwards-compatible with the currently deployed frontend (expand → deploy → contract), so Vercel Instant Rollback stays safe.
- Before any destructive migration, keep snapshot tables in a `backup` schema (not `public`) with RLS on, or rely on PITR.
- Add a minimal CI (GitHub Action: `npm ci && npm run build`) so a broken build never reaches `main`.
- Document the runbook: who can run `db push`, how to roll back the frontend (Vercel → Deployments → Instant Rollback), how to restore DB (PITR / backup), how to restore storage (re-sync from external bucket).

## 8. Changes requiring approval (none were made)

- Committing/pushing the working tree, merging `main` into `supabase-integration`, renaming the colliding migration.
- Any Supabase plan/PITR change, `db pull`/`db dump` against production, RLS changes (profiles policy, `_backup_*` tables).
- Adding Vercel env vars (Preview, Google Maps key), removing `public/supabase-test.html`, gitignoring `supabase/.temp/`.
