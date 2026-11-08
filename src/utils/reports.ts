import { supabase } from './supabaseClient';

// Mirrors the CHECK constraint / RPC validation in
// supabase/migrations/20261108000000_post_reports_moderation.sql.
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

export const REPORT_DETAILS_MAX_LENGTH = 500;
export const MODERATOR_NOTE_MAX_LENGTH = 1000;

export function reportReasonLabel(reason: string) {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// The RPCs raise short stable codes as the error message; map them to copy.
const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Please sign in again to report.',
  invalid_reason: 'Please choose a reason.',
  details_required: 'Please add a few words about what’s wrong.',
  details_too_long: `Details must be ${REPORT_DETAILS_MAX_LENGTH} characters or fewer.`,
  not_found: 'This post is no longer available.',
  cannot_report_own: 'You can’t report your own post.',
  rate_limited: 'You’ve sent a lot of reports today. Please try again tomorrow.',
  forbidden: 'You don’t have permission to do that.',
  note_too_long: `Notes must be ${MODERATOR_NOTE_MAX_LENGTH} characters or fewer.`,
  reports_must_share_one_post: 'Those reports are about different posts. Refresh and try again.',
};

function toFriendlyError(error: { message?: string; code?: string }, fallback: string) {
  const code = error.message ?? '';
  if (ERROR_COPY[code]) return new Error(ERROR_COPY[code]);
  // PGRST202: function not found — the migration hasn't been applied.
  if (error.code === 'PGRST202' || error.code === '42883') {
    return new Error('Reporting isn’t set up on the server yet.');
  }
  return new Error(fallback);
}

export async function submitPostReport(
  postId: string,
  reason: ReportReason,
  details: string,
): Promise<'created' | 'duplicate'> {
  const { data, error } = await supabase.rpc('submit_post_report', {
    p_post_id: postId,
    p_reason: reason,
    p_details: details.trim() || null,
  });
  if (error) {
    console.error('[submitPostReport]', error);
    throw toFriendlyError(error, 'Couldn’t send your report. Please try again.');
  }
  return data === 'duplicate' ? 'duplicate' : 'created';
}

export interface PostReportSnapshot {
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  category?: string | null;
  created_at?: string | null;
}

// Intentionally has no reporter or author identifiers — the RPC never
// returns them.
export interface AdminPostReport {
  id: string;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  action_taken: 'none' | 'hidden' | 'unhidden' | 'removed' | null;
  moderator_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  content_snapshot: PostReportSnapshot;
  post_exists: boolean;
  post_hidden: boolean;
  live_content: PostReportSnapshot | null;
}

export async function listPostReports(status?: ReportStatus): Promise<AdminPostReport[]> {
  const { data, error } = await supabase.rpc('admin_list_post_reports', {
    p_status: status ?? null,
  });
  if (error) {
    console.error('[listPostReports]', error);
    throw toFriendlyError(error, 'Couldn’t load reports.');
  }
  return (data ?? []) as AdminPostReport[];
}

export async function moderatePostReports(
  reportIds: string[],
  status: ReportStatus,
  action: ModerationAction = 'none',
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_moderate_post_reports', {
    p_report_ids: reportIds,
    p_status: status,
    p_action: action,
    p_note: note?.trim() || null,
  });
  if (error) {
    console.error('[moderatePostReports]', error);
    throw toFriendlyError(error, 'Couldn’t save that decision. Please try again.');
  }
}
