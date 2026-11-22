import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Postgres schema the app reads and writes. "public" is production; the
// staging schema (supabase/staging/) lives in the same project, so Auth,
// Storage and project settings are still shared with production.
export const dbSchema = (import.meta.env.VITE_SUPABASE_DB_SCHEMA as string | undefined) || 'public';
export const isStagingSchema = dbSchema !== 'public';

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-url.supabase.co',
  supabaseAnonKey || 'missing-supabase-anon-key',
  { db: { schema: dbSchema } },
);
