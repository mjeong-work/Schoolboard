import { supabase } from './supabaseClient';

// Mirrors the CHECK constraints / RPC validation in
// supabase/migrations/20261121000500_reports_moderation.sql.
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam', hint: 'Ads, scams, or repetitive posts' },
  { value: 'harassment', label: 'Harassment or bullying', hint: 'Targets or insults someone' },
  { value: 'hate', label: 'Hate speech', hint: 'Attacks a group of people' },
  { value: 'sexual_content', label: 'Sexual content', hint: 'Nudity or sexual material' },
  { value: 'violence_or_threat', label: 'Violence or threats', hint: 'Threatens or promotes harm' },
  { value: 'personal_info', label: 'Personal information', hint: "Shares or guesses someone's identity or contact info" },
  { value: 'impersonation', label: 'Impersonation', hint: 'Pretends to be someone else' },
  { value: 'other', label: 'Something else', hint: 'Tell us what’s wrong' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';
export type ModerationAction = 'none' | 'hide' | 'unhide' | 'remove';

/** Anything a user can report or block the author of. */
export type ContentType =
  | 'post'
  | 'post_comment'
  | 'marketplace_item'
  | 'marketplace_comment'
  | 'event'
  | 'event_comment';

export type CommentContentType = Extract<ContentType, `${string}_comment`>;

/** Short noun for UI copy: "Report listing", "Remove comment". */
export const CONTENT_NOUN: Record<ContentType, string> = {
  post: 'post',
  post_comment: 'comment',
  marketplace_item: 'listing',
  marketplace_comment: 'comment',
  event: 'event',
  event_comment: 'comment',
};

/** Where a piece of content lives, for the admin queue. */
export const CONTENT_AREA: Record<ContentType, string> = {
  post: 'Community post',
  post_comment: 'Comment on a post',
  marketplace_item: 'Marketplace listing',
  marketplace_comment: 'Comment on a listing',
  event: 'Event',
  event_comment: 'Comment on an event',
};

export const REPORT_DETAILS_MAX_LENGTH = 500;
export const MODERATOR_NOTE_MAX_LENGTH = 1000;

export function reportReasonLabel(reason: string) {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// The RPCs raise short stable codes as the error message; map them to copy.
const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  invalid_target: 'That can’t be reported.',
  invalid_reason: 'Please choose a reason.',
  details_required: 'Please add a few words about what’s wrong.',
  details_too_long: `Details must be ${REPORT_DETAILS_MAX_LENGTH} characters or fewer.`,
  not_found: 'This is no longer available.',
  cannot_report_own: 'You can’t report your own content.',
  rate_limited: 'You’ve sent a lot of reports today. Please try again tomorrow.',
  forbidden: 'You don’t have permission to do that.',
  note_too_long: `Notes must be ${MODERATOR_NOTE_MAX_LENGTH} characters or fewer.`,
  reports_must_share_one_target: 'Those reports are about different content. Refresh and try again.',
};

/**
 * The RPC (or table) doesn't exist in the connected database — the
 * reporting/blocking migrations haven't been applied there yet. The UI
 * shows a setup state for this instead of a generic failure.
 */
export class BackendNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendNotReadyError';
  }
}

/** PGRST202: function not in the schema cache; 42883: undefined function; PGRST205: table missing. */
export function isMissingBackend(error: { code?: string }) {
  return error.code === 'PGRST202' || error.code === '42883' || error.code === 'PGRST205';
}

function toFriendlyError(error: { message?: string; code?: string }, fallback: string) {
  const code = error.message ?? '';
  if (ERROR_COPY[code]) return new Error(ERROR_COPY[code]);
  if (isMissingBackend(error)) {
    return new BackendNotReadyError('Reporting isn’t set up on the server yet.');
  }
  return new Error(fallback);
}

export async function submitReport(
  targetType: ContentType,
  targetId: string,
  reason: ReportReason,
  details: string,
): Promise<'created' | 'duplicate'> {
  const { data, error } = await supabase.rpc('submit_report', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details.trim() || null,
  });
  if (error) {
    console.error('[submitReport]', error);
    throw toFriendlyError(error, 'Couldn’t send your report. Please try again.');
  }
  return data === 'duplicate' ? 'duplicate' : 'created';
}

/** Normalized by the server for every content type. */
export interface ReportContentSnapshot {
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  category?: string | null;
  price?: number | null;
  event_date?: string | null;
  created_at?: string | null;
  /** Comments only: the post/listing/event they were left on. */
  parent_id?: string | null;
  parent_title?: string | null;
}

// Intentionally has no reporter or author identifiers — the RPC never
// returns them.
export interface AdminReport {
  id: string;
  target_type: ContentType;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  action_taken: 'none' | 'hidden' | 'unhidden' | 'removed' | null;
  moderator_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  content_snapshot: ReportContentSnapshot;
  target_exists: boolean;
  target_hidden: boolean;
  live_content: ReportContentSnapshot | null;
}

export async function listReports(status?: ReportStatus): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_list_reports', {
    p_status: status ?? null,
  });
  if (error) {
    console.error('[listReports]', error);
    throw toFriendlyError(error, 'Couldn’t load reports.');
  }
  return (data ?? []) as AdminReport[];
}

export async function moderateReports(
  reportIds: string[],
  status: ReportStatus,
  action: ModerationAction = 'none',
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_moderate_reports', {
    p_report_ids: reportIds,
    p_status: status,
    p_action: action,
    p_note: note?.trim() || null,
  });
  if (error) {
    console.error('[moderateReports]', error);
    throw toFriendlyError(error, 'Couldn’t save that decision. Please try again.');
  }
}

export type ReportCounts = Record<ReportStatus, number> & { byType: Partial<Record<ContentType, number>> };

/** Status totals (and open reports per content type) without loading the queue. */
export async function fetchReportCounts(): Promise<ReportCounts> {
  const { data, error } = await supabase.rpc('admin_report_counts');
  if (error) {
    console.error('[fetchReportCounts]', error);
    throw toFriendlyError(error, 'Couldn’t load report counts.');
  }
  const counts: ReportCounts = { pending: 0, under_review: 0, resolved: 0, dismissed: 0, byType: {} };
  for (const row of (data ?? []) as { status: ReportStatus; target_type: ContentType; report_count: number }[]) {
    const n = Number(row.report_count) || 0;
    counts[row.status] = (counts[row.status] ?? 0) + n;
    if (row.status === 'pending' || row.status === 'under_review') {
      counts.byType[row.target_type] = (counts.byType[row.target_type] ?? 0) + n;
    }
  }
  return counts;
}

/** One moderation decision on a piece of content. No admin ids — just "you" or "another admin". */
export interface ModerationHistoryEntry {
  id: string;
  action: ModerationAction;
  status: ReportStatus | null;
  note: string | null;
  report_count: number;
  created_at: string;
  by_me: boolean;
}

export async function listModerationHistory(targetType: ContentType, targetId: string): Promise<ModerationHistoryEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_moderation_actions', {
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) {
    console.error('[listModerationHistory]', error);
    throw toFriendlyError(error, 'Couldn’t load the moderation history.');
  }
  return (data ?? []) as ModerationHistoryEntry[];
}
