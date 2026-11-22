# Reporting & Blocking — Technical Specification (Week 1)

**Owner:** Minkyoung · **Status:** Draft for next sprint · **Needs input from:** Jiho (Account & Security)
**Scope:** Spec only. No schema, migration, or RLS changes were made in Week 1.

---

## 0. Current state (verified from repo + `origin/main`, 2026-11-01)

| Area | Finding |
|---|---|
| Report UI | `PostCard` has a "Report post" menu item. It did nothing; it now shows "Reporting isn't available yet." No report UI for comments, listings, or users. |
| Report storage | None. No `reports` table in any migration. |
| Blocking | None. No table, no filtering. |
| Display anonymity | `origin/main` (Jiho, PR #1) shows per-item aliases (`getAnonymousName(post.id)`) instead of `profiles.name`. **The `supabase-integration` branch predates this and still shows `profiles.name`.** |
| Identity reveal | `origin/main` adds `admin_reveal_post_author` / `admin_reveal_listing_seller` (SECURITY DEFINER, `is_admin()` gated). They return **name + email to any admin**, with no audit log or reason. |
| Underlying ID leak | Every feed/listing/comment row still sends `author_id` / `seller_id` / `post_likes.user_id` to every client, and `20260829000000_marketplace_hardening.sql` grants `SELECT` on **all `profiles` columns (incl. email)** to any authenticated user. Anyone with dev tools can join `author_id → profiles` and de-anonymize authors. Display anonymity is cosmetic until this is fixed. |
| Admin role | `profiles.role = 'Administrator'` + `public.is_admin()`. Only one admin tier exists. |
| Feed schema | `posts`, `post_likes`, `post_comments` are **not in any migration** (created out-of-band), so their FKs, cascades, and unique constraints are unverified. |

The reporting/blocking design below assumes the ID leak gets fixed (§5). Otherwise reports and blocks can be cross-referenced to real identities from the client.

---

## 1. Reporting — requirements

### 1.1 Entry points
"Report" in the existing `…` menu on each surface:

| Target | Surface |
|---|---|
| Post | `PostCard` menu (exists, currently a stub) |
| Comment | `CommentsPanel` per-comment menu (currently only shows Delete for own/admin. Add Report for everyone else) |
| Listing | `MarketplaceCard` + `MarketplacePostDetailPage` menu (currently only rendered for owner/admin. Must render for everyone) |
| User | Shown only as "Report this author" from a post/comment/listing. No profile pages exist for other users, and a standalone "report user X" would require exposing a stable user handle. |

Flow: menu → bottom sheet / dialog with reason radio list + optional details (≤ 500 chars) → Submit → toast "Thanks — our moderators will review this." Reporters never see the outcome tied to a name. Optional: "Also block this author" checkbox (see §2).

### 1.2 Reasons (enum `report_reason`)
`spam`, `harassment`, `hate`, `sexual_content`, `violence_or_threat`, `personal_info` (doxxing / de-anonymizing someone), `scam_or_fraud` (marketplace), `prohibited_item` (marketplace), `impersonation`, `other` (details required).

### 1.3 Required fields
`target_type`, `target_id`, `reason`, `details?`, plus server-set `reporter_id = auth.uid()`, `target_author_id` (resolved server-side, never from client), `content_snapshot` (title/text/image URLs at report time, so evidence survives edits/deletes), `status`, timestamps.

### 1.4 Duplicates & abuse
- Unique `(reporter_id, target_type, target_id)` where status is open. A re-report returns "You've already reported this." and is not an error.
- Per-reporter rate limit (e.g. 20 reports / 24 h) enforced in the RPC.
- Admin queue groups by target and shows a report count. Optional auto-hide threshold (e.g. ≥ 5 distinct reporters → `hidden_pending_review`) as P2.

### 1.5 Statuses
`pending` → `reviewing` → `resolved` | `dismissed`. `resolved` records an `action_taken` enum: `none`, `content_removed`, `warning`, `user_suspended`.

### 1.6 Access
| Role | Can |
|---|---|
| Reporter | Insert via RPC. No SELECT. (Optional later: "My reports" with status only.) |
| Reported user | Nothing. Never learns who reported. |
| Admin (moderator) | SELECT queue via a view that exposes **alias + content snapshot, not reporter or author identity**. Update status/action. |
| Identity-reveal | A separate, narrower capability (see §3). Not part of normal moderation. |

### 1.7 Admin moderation workflow
1. New **Reports** tab in `AdminPage` (alongside Pending/Posts/Listings) with a count badge.
2. Queue is grouped by target, sorted by report count then age. Each row shows the content snapshot, the live content (if it still exists), reasons, the count, and the author's **alias** only.
3. Actions: Dismiss · Remove content (reuses existing delete paths) · Warn author · Suspend author (needs Jiho; see §6) · Mark reviewing.
4. Every action writes to `moderation_actions` (who, what, when, note).
5. "Reveal identity" is not in this tab by default (§3).

---

## 2. Blocking — recommended MVP behavior

**Principle:** blocking is private, one-directional to set, but **symmetric in effect**, enforced **server-side**, and never notifies the blocked user.

| Question | MVP decision |
|---|---|
| Blocked user's posts/comments visible to blocker? | **Hidden** from the blocker everywhere: feed, comments, events, marketplace. Comment threads show "Comment from a blocked user" collapsed placeholder so replies still make sense. |
| Blocker's content visible to blocked user? | **Hidden** too (symmetric), so the blocked user can't keep interacting. |
| Can they interact? | No. Server rejects likes, comments, saves, RSVPs, and new DMs between the pair (RLS `WITH CHECK NOT is_blocked_pair(...)`). |
| Marketplace listings | Hidden both ways. Existing marketplace conversations become read-only. |
| Existing comments/likes | **Kept in the DB** (no deletion), just filtered from each other's view. Like counts stay as aggregate numbers. |
| DMs | Existing conversation hidden from both lists. New conversation creation blocked. |
| Unblock | Yes, from Settings → Blocked users. The list shows the **alias at the time of blocking + content snippet**, never a real name. Unblock restores visibility. Nothing that was hidden is deleted. |
| Notification to blocked user | None. Their actions fail with a generic "This content is unavailable." |
| Admins | Blocks never hide content from admins. |
| Limit | Cap of 500 blocks per user (abuse guard). |

**Anonymity wrinkle:** the feed shows per-item aliases, so a user can't name whom they block. "Block" is always initiated *from a piece of content* and the server resolves `target_author_id`. The client never needs, or receives, the blocked user's id.

---

## 3. Data structures (proposed — not applied)

```sql
-- Enums
CREATE TYPE report_target AS ENUM ('post','post_comment','marketplace_item','marketplace_comment','event','event_comment','user');
CREATE TYPE report_status AS ENUM ('pending','reviewing','resolved','dismissed');
CREATE TYPE report_reason AS ENUM ('spam','harassment','hate','sexual_content','violence_or_threat',
                                   'personal_info','scam_or_fraud','prohibited_item','impersonation','other');

CREATE TABLE public.reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  target_type      report_target NOT NULL,
  target_id        uuid NOT NULL,           -- polymorphic; no FK so evidence survives deletion
  target_author_id uuid REFERENCES profiles(id) ON DELETE SET NULL, -- set by RPC, never by client
  reason           report_reason NOT NULL,
  details          text CHECK (char_length(details) <= 500),
  content_snapshot jsonb NOT NULL,
  status           report_status NOT NULL DEFAULT 'pending',
  action_taken     text,
  resolved_by      uuid REFERENCES profiles(id),
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reports_one_open_per_reporter
  ON reports (reporter_id, target_type, target_id) WHERE status IN ('pending','reviewing');
CREATE INDEX reports_queue ON reports (status, created_at);
CREATE INDEX reports_target ON reports (target_type, target_id);

CREATE TABLE public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_alias text,           -- alias shown when blocked, for the "Blocked users" list
  source_snippet text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked ON user_blocks (blocked_id);

CREATE TABLE public.moderation_actions (   -- append-only audit log
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL,            -- 'dismiss','remove_content','warn','suspend','reveal_identity',...
  report_id uuid REFERENCES reports(id),
  target_type report_target, target_id uuid,
  reason text NOT NULL,            -- required, esp. for reveal_identity
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**RPCs (SECURITY DEFINER, `search_path = public`):**
- `submit_report(p_target_type, p_target_id, p_reason, p_details)` resolves the author and snapshot server-side, applies the rate limit and dedupe, and returns `{status: 'created'|'duplicate'}`.
- `block_author_of(p_target_type, p_target_id)` / `unblock(p_block_id)` / `list_my_blocks()` keep user ids out of the client.
- `is_blocked_pair(a uuid, b uuid) RETURNS boolean` is STABLE and used inside RLS.
- `admin_report_queue()` returns grouped queue rows with aliases and no ids or emails.
- `admin_resolve_report(p_report_id, p_status, p_action, p_note)` writes `moderation_actions`.

**RLS:**
- `reports`: no direct INSERT/SELECT for normal users (RPC only). Admin SELECT/UPDATE.
- `user_blocks`: owner SELECT/DELETE own rows only. INSERT via RPC.
- `moderation_actions`: admin SELECT. INSERT only via RPCs. No UPDATE/DELETE.
- Content tables (`posts`, `post_comments`, `marketplace_items`, `marketplace_comments`, events, likes, saves, messages): add `AND NOT is_blocked_pair(auth.uid(), author_col)` to SELECT, and add the same to INSERT `WITH CHECK` for interactions.

**Client:** `dataContext` needs no shape change. Filtering is server-side, so a block takes effect on the next load. After blocking, also drop the author's items locally by target id for instant feedback.

---

## 4. Security & anonymity requirements

1. **Moderators see aliases, not identities.** The report queue view must not include `reporter_id`, `target_author_id`, names, or emails.
2. **Identity reveal is a separate, audited escalation.** Today any admin can call `admin_reveal_*` and get name + email silently. Recommendation: require a `reason` argument, write `moderation_actions('reveal_identity')`, restrict to a `super_admin` / safety-officer role, and never return email unless legally needed.
3. **Reporters are never exposed**, including to admins in the normal queue.
4. **Stop shipping raw user ids to clients** (prerequisite): replace `author_id` / `seller_id` / `post_likes.user_id` in client payloads with booleans (`is_mine`, `liked_by_me`) and counts, via views or RPCs. Narrow the `profiles` SELECT policy so other users can't read `email`, `name`, `department`, `graduation_year`.
5. School-verification details (email domain, approval status) stay out of every report/block payload.
6. Content snapshots may include personal info the reporter flagged. Restrict to admins and define retention (e.g. purge 180 days after resolution).

---

## 5. Dependencies requiring Jiho

| # | Item | Why it's Jiho's |
|---|---|---|
| J1 | **Merge strategy for `supabase-integration` ↔ `main`.** The Oct 24 + Week 1 work predates PR #1 and would re-introduce real names. | Owns anonymity changes in PR #1 |
| J2 | **Migration version collision:** `20260829000000_add_admin_author_reveal_rpc.sql` (main) vs `20260829000000_marketplace_hardening.sql` (this branch). One must be renamed before any `db push`. | Owns the reveal RPC migration |
| J3 | Narrow `profiles` SELECT (hide email/name/etc. from non-admins). Reverses part of the marketplace hardening policy. | RLS / identity |
| J4 | Remove raw user ids from client payloads (§4.4). | Identity model |
| J5 | Admin role tiers (`moderator` vs `super_admin`) + audited reveal. | Roles/auth |
| J6 | Suspension mechanism (`profiles.status = 'suspended'`? auth ban?) for the "Suspend author" action. | Account lifecycle |
| J7 | Should a user's alias be stable per user (needed for "Blocked users" list readability) or per item (current)? | Anonymity model |

---

## 6. Recommended implementation priority (next phase)

| Order | Work | Size |
|---|---|---|
| P0-1 | Resolve J1/J2 (branch merge + migration rename). Nothing else should ship before this. | S |
| P0-2 | Close the ID/profile leak (J3, J4). Without it, report/block can be de-anonymized. | M |
| P1-1 | `reports` table + `submit_report` RPC + Report UI on post/comment/listing | M |
| P1-2 | Admin Reports tab + `moderation_actions` audit log | M |
| P1-3 | Audited identity reveal (J5) | S |
| P1-4 | `user_blocks` + `is_blocked_pair` + RLS filtering on feed/comments/marketplace/DMs | L |
| P2 | Blocked-users settings page, auto-hide threshold, reporter rate-limit tuning, snapshot retention job | M |
