# Post Reporting & Moderation — MVP (feature/reporting-moderation)

Builds on `docs/week1-reporting-blocking-spec.md`. Scope: **posts only**. Comments, listings and events reuse the same pattern later.

## What's in this branch

| Layer | Change |
|---|---|
| DB (file only, **not applied**) | `supabase/migrations/20261108000000_post_reports_moderation.sql`: `reports`, `moderation_actions`, `posts.hidden_at`, a RESTRICTIVE "hide" policy on `posts`, and 3 SECURITY DEFINER RPCs |
| Client API | `src/utils/reports.ts`: reasons, `submitPostReport`, `listPostReports`, `moderatePostReports`, error-code → copy mapping |
| Reporter UI | `src/components/ReportPostDialog.tsx`, wired into the `PostCard` menu. The item is hidden on your own posts |
| Admin UI | `src/components/AdminReportsPanel.tsx`, shown as a new **Reports** tab in `AdminPage` |

**Flow:** Post `⋯` → Report post → choose a reason (details are required for "Something else", max 500 chars) → Submit → "Thanks" confirmation, or "Already reported". Cancel, back gesture and Escape all close it. While sending, the dialog can't be closed and Submit is disabled with a ref guard. Errors show inline and keep the selection. No feed refetch.

**Admin:**
- Filter by Pending / Under review / Resolved / Dismissed / All.
- Reports are grouped per post and status into one case.
- Each case shows the post alias, the content (live, or the snapshot if the post was removed), an "edited since reported" flag, reason counts, and reporters' notes.
- Actions:
  - Start review
  - Hide post & resolve
  - Restore post
  - Remove post (with confirmation)
  - Resolve
  - Dismiss
  - Reopen
- An optional decision note is saved on the reports and in the `moderation_actions` audit log.
- The queue updates locally; there is no full reload.

**Privacy:**
- Nobody can read `reports` or `moderation_actions` directly; table grants are revoked and RLS is on with no policies.
- `admin_list_post_reports` never returns the reporter's id or the author's id, name or email.
- The client only sends a post id; the server resolves the author.
- Admins see the same alias as the feed.
- Identity reveal stays the separate `admin_reveal_post_author` RPC; it is not changed here.

**Server-side rules:**
- One open report per reporter per post. A duplicate returns `'duplicate'`, including under a race.
- At most 20 reports per user per 24 h.
- You can't report your own post.
- Hidden or removed posts can't be reported.
- `reason` and status values are validated.
- Every admin RPC checks `is_admin()`.

**Hide:** a RESTRICTIVE select policy (`hidden_at IS NULL OR author OR admin`). It ANDs with the existing `posts` policies, so they don't need to change. The author still sees their own hidden post.

## Before applying the migration (needs approval)

1. Confirm `posts` has RLS **enabled**. If not, the migration prints a WARNING and "hide" has no effect.
2. Confirm deleting a post works with its likes and comments (FK cascade). The posts tables aren't in migrations; Remove uses the same `DELETE` as the existing admin delete.
3. Resolve the existing `20260829000000` version collision with `main` first.
4. Apply to a staging project, run the scenarios below, then production. Deploy the frontend **after** the migration. Before it, Report shows "Reporting isn't set up on the server yet."

## Tested

Run against a throwaway local Postgres 17 with a stub `auth.uid()`, `profiles`, `posts` and `is_admin()`. Not Supabase.
- The migration applies, and applies again idempotently.
- 19 scenarios pass:
  - created, duplicate
  - invalid reason, details required, details too long
  - not found, own post
  - direct table access denied, non-admin list/moderate denied, `anon` has no execute
  - review → hide+resolve, hidden visibility (other 0 / author 1 / admin 1), hidden post not reportable
  - unhide → remove keeps the snapshot
  - mixed-post ids rejected, invalid status rejected, dismiss with note
  - audit rows, rate limit at 20

Not tested: in a browser or against Supabase/PostgREST.

## User blocking — status & MVP plan

**Status:** not implemented. There is no table, RPC, UI or filtering anywhere in the code or migrations.

**MVP (spec §2–3):**
1. **DB:**
   - `user_blocks(blocker_id, blocked_id, source_alias, created_at)`.
   - `is_blocked_pair(a, b)` (STABLE, SECURITY DEFINER).
   - `block_author_of(target_type, target_id)`, `unblock(id)`, `list_my_blocks()`. The client never sees user ids.
2. **Visibility:** RESTRICTIVE select policies, the same technique as "hide", on `posts`, `post_comments`, `marketplace_items`, `marketplace_comments`, `events`, `event_comments`: `NOT is_blocked_pair(auth.uid(), author)`. Admins are exempt. This works in both directions.
3. **Interactions:** the same check in `WITH CHECK` for likes, comments, saves, RSVPs and new conversations. Existing DMs become read-only.
4. **UI:**
   - "Block author" in the post, comment and listing menus, plus an optional checkbox in the report dialog.
   - Settings → Blocked users shows the alias at the time of blocking, with Unblock.
   - After a block, drop the author's items locally; no refetch.
5. **Dependencies on Jiho:**
   - J3/J4: the `profiles` and raw-id leak still allows de-anonymization.
   - J7: aliases are per-item, so the "Blocked users" list can only show the alias as it appeared on that item.

**Estimate:** about M–L, mostly RLS on 8 tables plus tests. Keep it out of this sprint.
