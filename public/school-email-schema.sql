-- ============================================================
-- School-email auto-approval for figma_schoolboard
-- Run this in: Supabase Dashboard → SQL Editor → New query
--
-- REQUIRED DASHBOARD CONFIG (one-time, done by hand):
--  1. Authentication → Sign In / Providers → Email → enable "Confirm email"
--  2. Authentication → Email Templates → "Confirm signup" → send a code:
--       <h2>Confirm your signup</h2>
--       <p>Your Campus Connect verification code is:</p>
--       <h1>{{ .Token }}</h1>
--       <p>This code expires in 1 hour.</p>
--  3. (Production) Project Settings → Auth → SMTP → custom SMTP
--     (built-in SMTP sends only ~2-4 emails/hour)
-- ============================================================

-- 1. Domain heuristic — MUST stay in sync with src/utils/schoolEmail.ts
CREATE OR REPLACE FUNCTION public.is_school_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(split_part(coalesce(p_email, ''), '@', 2))
         ~ '(\.edu|\.edu\.[a-z]{2,}|\.ac\.[a-z]{2,})$'
$$;

-- 2. BEFORE INSERT trigger: the DB, not the client, decides the initial
--    status. School domains are auto-approved; everything else goes to the
--    existing admin-approval queue as 'pending'. Admin status changes are
--    UPDATEs and are not affected.
CREATE OR REPLACE FUNCTION public.set_profile_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_school_email(NEW.email) THEN
    NEW.status   := 'approved';
    NEW.verified := true;
  ELSE
    NEW.status   := 'pending';
    NEW.verified := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_initial_status ON public.profiles;
CREATE TRIGGER set_profile_initial_status
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_initial_status();

-- 3. Sanity check — expected output: true, true, false, false
SELECT public.is_school_email('honor@virginia.edu')  AS us_edu,
       public.is_school_email('kim@snu.ac.kr')       AS ac_kr,
       public.is_school_email('a@gmail.com')         AS gmail,
       public.is_school_email('a@myedu.com')         AS lookalike;
