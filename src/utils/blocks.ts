import { supabase } from './supabaseClient';
import { BackendNotReadyError, isMissingBackend, type ContentType } from './reports';

// Client side of supabase/migrations/20261121000600_user_blocks.sql.
// Blocks are made by naming a piece of content; the server resolves its
// author, so no user id is ever sent or returned.

export interface BlockedUser {
  id: string;
  source_type: ContentType;
  /** The alias the author had where they were blocked (aliases are per item). */
  source_alias: string | null;
  created_at: string;
}

const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  invalid_target: 'That person can’t be blocked from here.',
  not_found: 'This is no longer available.',
  cannot_block_self: 'You can’t block yourself.',
  too_many_blocks: 'You’ve reached the limit of blocked accounts.',
};

function toFriendlyError(error: { message?: string; code?: string }, fallback: string) {
  const code = error.message ?? '';
  if (ERROR_COPY[code]) return new Error(ERROR_COPY[code]);
  if (isMissingBackend(error)) {
    return new BackendNotReadyError('Blocking isn’t set up on the server yet.');
  }
  return new Error(fallback);
}

export async function blockAuthorOf(
  targetType: ContentType,
  targetId: string,
  alias: string,
): Promise<'blocked' | 'already_blocked'> {
  const { data, error } = await supabase.rpc('block_author_of', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_source_alias: alias,
  });
  if (error) {
    console.error('[blockAuthorOf]', error);
    throw toFriendlyError(error, 'Couldn’t block this account. Please try again.');
  }
  return data === 'already_blocked' ? 'already_blocked' : 'blocked';
}

export async function listMyBlocks(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('list_my_blocks');
  if (error) {
    console.error('[listMyBlocks]', error);
    throw toFriendlyError(error, 'Couldn’t load your blocked accounts.');
  }
  return (data ?? []) as BlockedUser[];
}

export async function unblock(blockId: string): Promise<void> {
  const { data, error } = await supabase.rpc('unblock', { p_block_id: blockId });
  if (error) {
    console.error('[unblock]', error);
    throw toFriendlyError(error, 'Couldn’t unblock. Please try again.');
  }
  if (data === false) throw new Error('This account is no longer blocked.');
}

/** Aggregate-only blocking numbers for admins — never who blocked whom. */
export interface BlockStats {
  total_blocks: number;
  blocks_last_7_days: number;
  blocks_last_30_days: number;
  accounts_blocking: number;
  accounts_blocked: number;
  accounts_blocked_by_3_plus: number;
  blocked_with_open_reports: number;
  by_source: Partial<Record<ContentType, number>>;
}

export async function fetchBlockStats(): Promise<BlockStats> {
  const { data, error } = await supabase.rpc('admin_block_stats');
  if (error) {
    console.error('[fetchBlockStats]', error);
    throw toFriendlyError(error, 'Couldn’t load blocking statistics.');
  }
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  const num = (v: unknown) => Number(v) || 0;
  return {
    total_blocks: num(row.total_blocks),
    blocks_last_7_days: num(row.blocks_last_7_days),
    blocks_last_30_days: num(row.blocks_last_30_days),
    accounts_blocking: num(row.accounts_blocking),
    accounts_blocked: num(row.accounts_blocked),
    accounts_blocked_by_3_plus: num(row.accounts_blocked_by_3_plus),
    blocked_with_open_reports: num(row.blocked_with_open_reports),
    by_source: row.by_source ?? {},
  };
}
