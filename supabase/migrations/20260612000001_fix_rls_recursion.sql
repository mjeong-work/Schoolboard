-- =============================================================
-- Fix: 42P17 infinite recursion in profiles RLS policies.
--
-- Root cause: "Admins can view/update all profiles" uses
--   EXISTS (SELECT 1 FROM public.profiles WHERE ...)
-- inside a policy ON public.profiles. PostgreSQL evaluates every
-- permissive policy before returning rows, so this query triggers
-- its own RLS check, which triggers the subquery again → infinite
-- recursion for ALL users, not just admins.
--
-- Fix: a SECURITY DEFINER helper that queries profiles as the
-- postgres superuser, which bypasses RLS entirely.
-- =============================================================

-- 1. Non-recursive admin check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Administrator'
  );
$$;

-- 2. Re-create the recursive profiles policies using the helper
DROP POLICY IF EXISTS "Admins can view all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- 3. Fix the same pattern in events / event_comments policies
DROP POLICY IF EXISTS "author or admin can delete events" ON public.events;
CREATE POLICY "author or admin can delete events"
  ON public.events FOR DELETE
  USING (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "author or admin can delete event comments" ON public.event_comments;
CREATE POLICY "author or admin can delete event comments"
  ON public.event_comments FOR DELETE
  USING (auth.uid() = author_id OR public.is_admin());
