# Reporting, Moderation & User Blocking — MVP

Branch: `feature/reporting-blocking-mvp`. It is based on `integration/nov-2026-stabilization` and includes `feature/reporting-moderation`.

Builds on `docs/week1-reporting-blocking-spec.md`. It replaces the posts-only plan from `feature/reporting-moderation`.

## Why reporting wasn't visible before

- On the branches people run, "Report post" only showed a "Reporting isn't available yet." toast, and "Report event" did nothing.
- The real flow existed only on the unmerged `feature/reporting-moderation` branch.
- Its RPCs are not in any database yet. Until the migrations are applied, the UI shows "Reporting isn't set up on the server yet."
- The marketplace ⋯ menu was rendered only for the owner or an admin.
- On mobile, the listing detail page's header sat under the nav bar (`z-40` vs `z-50`), so its Back button and menu couldn't be tapped.

## What's included

| Layer | Change |
|---|---|
| DB (files only, **not applied**) | `20261121000500_reports_moderation.sql`: `reports` and `moderation_actions` tables; `hidden_at` and a RESTRICTIVE hide policy on 6 content tables; a trigger so only admins change `hidden_at`; RPCs `submit_report`, `admin_list_reports`, `admin_moderate_reports` |
| | `20261121000600_user_blocks.sql`: `user_blocks` table; RESTRICTIVE visibility and interaction policies; RPCs `block_author_of`, `list_my_blocks`, `unblock` |
| Client API | `src/utils/reports.ts` (generalized), `src/utils/blocks.ts` |
| Reporter / blocker UI | `ReportDialog` (generalized from `ReportPostDialog`) and the `useContentSafety` hook (`ContentSafety.tsx`), wired into post, listing (card and mobile detail page) and event menus, and into comment menus on all three |
| Settings | `BlockedUsersPage` (`#/blocked-users`), linked from Edit profile → Privacy & safety |
| Admin UI | `AdminReportsPanel`: content-type filter, per-type labels and actions, parent context for comments |
| Tests | `supabase/tests/`: local Postgres harness plus 88 RLS/RPC scenarios |

Content types: `post`, `post_comment`, `marketplace_item`, `marketplace_comment`, `event`, `event_comment`.

## Reporting flow

1. ⋯ → **Report {post | listing | event | comment}**. This item is hidden on your own content.
2. Pick a reason. "Something else" requires details (max 500 characters).
3. Submit. You get a "Thanks" confirmation, or "Already reported" if you have an open report on the same item.

Behaviour:
- While sending, Submit is disabled, a ref blocks double taps, and the dialog can't be closed.
- On failure, an inline error appears and the selection is kept.
- No feed refetch.

Server rules:
- One open report per reporter per item, safe under a race.
- 20 reports per user per 24 hours.
- You can't report your own content.
- Hidden or removed content can't be reported.
- The server resolves the author; the client sends only the type and id.

## Admin moderation

- Filters: content type (All / Posts / Listings / Events / Comments) × status (Pending / Under review / Resolved / Dismissed / All).
- Reports about the same item in the same status are grouped into one case.
- Each case shows:
  - the alias (the same one the feed shows)
  - the content, live or from the snapshot, with an "edited since reported" flag
  - for comments, the post, listing or event they were left on
  - reason counts and reporters' notes
- Actions:
  - Start review
  - Hide & resolve
  - Restore
  - Remove (with confirmation)
  - Resolve
  - Dismiss
  - Reopen
- An optional decision note is saved on the reports and in the `moderation_actions` audit log, together with the admin's id.
- The queue updates locally after each decision.

**Permissions are enforced in the database, not the UI:**
- `reports`, `moderation_actions` and `user_blocks` have RLS on, no policies, and table grants revoked.
- Every admin RPC checks `is_admin()`.
- `anon` can't execute any of these RPCs.
- The admin list never returns reporter ids or author ids, names or emails. Identity reveal stays the separate `admin_reveal_*` RPCs and is not changed here.

## Blocking policy

When A blocks B, the block applies in both directions:

| | Effect |
|---|---|
| Visibility | Neither sees the other's posts, listings, events or comments (Feed, Marketplace, Events, comment threads). |
| Interactions | Neither can like, comment on, save, or RSVP to the other's content. |
| Messages | Neither can start a new conversation with the other. Existing conversations stay readable, but no new messages can be sent. |
| Exemptions | You always see your own content. Admins see everything, so moderation keeps working. |
| Notification | B is not told. B's blocked list stays empty. |
| Identity | The client never sends or receives a user id. Blocks are made by naming a piece of content, and the server resolves its author. The blocked list shows the alias seen where the block was made (aliases are per item). |

Enforcement:
- RESTRICTIVE SELECT and INSERT policies, which AND with the existing policies.
- Helper functions live in `app_private`, a schema PostgREST does not expose.
- The peer list is evaluated once per query (InitPlan), not once per row.

Client behaviour:
- After a block, that author's items and comments are dropped from local state; no refetch.
- After an unblock, there is a silent background refetch.
- A message rejected by RLS shows a toast instead of disappearing.

## Applying (needs approval — not done)

1. Back up the production database first.
2. Apply to a **staging** project:
   ```sh
   supabase db push   # against staging, after confirming `supabase migration list`
   ```
   The batch `20261121000000..000600` must go in order. `000300` nulls base64 image columns; it backs them up to `_backup_20261024_*` first.
3. Check for `WARNING` lines in the output. The migrations warn if RLS is disabled on any table they rely on: `posts`, `post_comments` and `post_likes` were created outside the migrations folder.
4. Confirm that deleting a post cascades to its likes and comments. Remove uses a plain `DELETE`, the same as the existing admin delete.
5. Run the manual checklist below with User A, User B and an Admin on staging.
6. Deploy the frontend **after** the migrations. Before them, Report and Block fail gracefully with "…isn't set up on the server yet."

## Testing

**Automated (real Postgres 17, stubbed Supabase):** run `PGPORT=<port> sh supabase/tests/run_local.sh`.
- Applies all 24 migrations in order on an empty database.
- Runs 88 scenarios as User A, User B, User C, Admin and `anon`.
- Re-applying `000500` and `000600` is idempotent.
- Coverage:
  - Reporting: create, duplicate, validation, own content, all 6 types, rate limit.
  - Access control: direct table access denied, non-admin list/moderate denied, `anon` denied, internal helpers not callable.
  - Admin responses contain no identities.
  - Moderation: hide, restore and remove; the snapshot is kept; the audit log records the actor.
  - Authors can't un-hide their own content.
  - Blocks: two-way visibility for all 6 tables; likes, comments, saves and RSVPs denied; messages and new conversations denied; history still readable; bystanders and admins unaffected; unblock restores; B can't remove A's block.

**UI (browser, in-memory mock Supabase client — not committed):**
- Desktop:
  - Report post: success, duplicate, simulated network failure then retry, "Something else" requires details.
  - Own post shows no Report or Block.
  - Report a listing.
  - Block from a comment: content disappears without a reload and stays hidden after one; symmetric for B.
  - Blocked accounts page.
  - Admin queue: filters, hide & resolve with a note, resolved record.
  - A non-admin has no Admin link and is redirected away from `#admin`.
  - Author still sees their own hidden post; other users don't.
- Mobile (390px viewport):
  - Post menu and report dialog layout.
  - Listing detail page: Block seller leaves the page (after the z-index fix).
  - Unblock brings content back.
- "Migration not applied" path shows a friendly error.

**Not verified:** anything against real Supabase (PostgREST, GoTrue, Realtime, Storage), and the chat UI under a block (covered only at the SQL level).

## Known gaps (follow-ups)

- **P1 — single admin tier.** Every `Administrator` can call `admin_reveal_*`, which returns real names and emails, and sees the approval queue. These calls are not audited. Adding a separate "trust & safety lead" role, plus audit rows for reveals, needs a product decision (Jiho owns the reveal RPCs).
- **P1 — `author_id` is still in feed payloads.** Anyone with dev tools can link one author's items together, but not identify them (`profiles` stays own-row and admin only).
- **P2:**
  - An author whose content was hidden isn't told so in the UI.
  - Raw RLS error text on a like or comment made against stale UI.
  - Deep links (`#/admin`, `#/blocked-users`) fall back to Community on a cold reload. This router behaviour predates this branch.
  - The Reports tab count appears only after the tab has been opened once.
  - "Save event" and "Share event" menu items still do nothing. This predates this branch.
