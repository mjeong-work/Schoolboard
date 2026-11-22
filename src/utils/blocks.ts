import { supabase } from './supabaseClient';
import type { ContentType } from './reports';

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
  if (error.code === 'PGRST202' || error.code === '42883') {
    return new Error('Blocking isn’t set up on the server yet.');
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
