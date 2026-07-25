-- =============================================================
-- Fix: login fails because:
--   1. get_email_by_username() RPC was never defined in a migration.
--   2. handle_new_user trigger did not save username from user metadata,
--      so new registrations have username = NULL and can never be found
--      by the RPC.
-- =============================================================

-- 1. Create the RPC that login() calls to resolve username → email.
--    SECURITY DEFINER lets it bypass RLS (caller is unauthenticated).
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE username = p_username LIMIT 1;
$$;

-- 2. Patch the new-user trigger to also persist username from signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    username,
    role,
    department,
    graduation_year,
    status,
    verified
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'username',
    COALESCE(NEW.raw_user_meta_data->>'role', 'Student'),
    COALESCE(NEW.raw_user_meta_data->>'department', ''),
    NEW.raw_user_meta_data->>'graduation_year',
    'pending',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
