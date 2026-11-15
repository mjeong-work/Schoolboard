# School Email OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin-only approval with hybrid email verification: users verify ownership of their email via a 6-digit code sent by Supabase; recognized school domains (`.edu`, `.edu.*`, `.ac.*`) are auto-approved, everything else falls back to the existing admin-approval (`pending`) flow.

**Architecture:** Supabase Auth's built-in "Confirm email" + OTP template sends the code; the client calls `supabase.auth.verifyOtp({ type: 'signup' })`. A `BEFORE INSERT` trigger on `public.profiles` is the single server-side authority that sets `status`/`verified` from the email domain (client-side checks are UX only). A new `VerifyEmailPage` (hash route `#/verify-email`) handles code entry; pending email is passed between pages via `sessionStorage`.

**Tech Stack:** React 18 + TypeScript, Vite 6, Supabase JS v2, shadcn/ui (`input-otp` already vendored), Vitest (new devDependency, for the pure domain-check utility only).

## Global Constraints

- UI copy is **English**, matching the existing app (e.g. "Campus Connect", "Create Account").
- Styling follows existing conventions: brand blue `#0b5fff` / hover `#0a4ecc`, borders `#e5e5e5`, text `#111`/`#666`/`#999`, cards `bg-white border rounded-xl p-8`. No heading size classes (globals.css handles h1/h2).
- Hash-based routing only (`window.location.hash = '#/...'`); no router library.
- Session storage key for the email awaiting verification: `cc_pending_verification_email` (exact string, exported as `PENDING_VERIFICATION_EMAIL_KEY` from `authContext.tsx`).
- School-domain rule (identical in TS and SQL): the part after `@`, lowercased, matches `\.edu$` OR `\.edu\.[a-z]{2,}$` OR `\.ac\.[a-z]{2,}$`.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Supabase schema SQL files live in `public/` and are run manually in the Supabase Dashboard SQL Editor (existing project convention).

## Manual Supabase Dashboard Configuration (user does this once — not a code task)

The code only works after these dashboard changes (documented again in the SQL file header from Task 2):

1. **Authentication → Sign In / Providers → Email**: enable **"Confirm email"**.
2. **Authentication → Email Templates → "Confirm signup"**: replace the link-based body with a code body, e.g.
   ```html
   <h2>Confirm your signup</h2>
   <p>Your Campus Connect verification code is:</p>
   <h1>{{ .Token }}</h1>
   <p>This code expires in 1 hour.</p>
   ```
3. (Recommended for real use) **Project Settings → Auth → SMTP**: configure custom SMTP (e.g. Resend free tier). The built-in SMTP only sends ~2–4 emails/hour.
4. Run `public/school-email-schema.sql` (created in Task 2) in the SQL Editor.

---

### Task 1: School-email domain utility (TDD, with Vitest setup)

**Files:**
- Create: `src/utils/schoolEmail.ts`
- Test: `src/utils/schoolEmail.test.ts`
- Modify: `package.json` (add `vitest` devDependency + `test` script)

**Interfaces:**
- Produces: `isSchoolEmail(email: string): boolean` — later tasks (RegisterPage) import it from `./utils/schoolEmail`.

- [ ] **Step 1: Install Vitest and add test script**

Run: `npm i -D vitest`

Then edit `package.json` scripts block to:

```json
"scripts": {
      "dev": "vite",
      "build": "vite build",
      "test": "vitest run"
}
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/schoolEmail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isSchoolEmail } from './schoolEmail';

describe('isSchoolEmail', () => {
  it('accepts US .edu domains', () => {
    expect(isSchoolEmail('honor@virginia.edu')).toBe(true);
    expect(isSchoolEmail('hokie@vt.edu')).toBe(true);
    expect(isSchoolEmail('a@cs.stanford.edu')).toBe(true); // subdomain
  });

  it('accepts international academic domains (.ac.*, .edu.*)', () => {
    expect(isSchoolEmail('kim@snu.ac.kr')).toBe(true);
    expect(isSchoolEmail('student@ox.ac.uk')).toBe(true);
    expect(isSchoolEmail('s@unsw.edu.au')).toBe(true);
    expect(isSchoolEmail('s@tsinghua.edu.cn')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isSchoolEmail('Honor@VIRGINIA.EDU')).toBe(true);
    expect(isSchoolEmail('  honor@virginia.edu  ')).toBe(true);
  });

  it('rejects consumer domains', () => {
    expect(isSchoolEmail('a@gmail.com')).toBe(false);
    expect(isSchoolEmail('a@outlook.com')).toBe(false);
    expect(isSchoolEmail('a@naver.com')).toBe(false);
  });

  it('rejects look-alike domains', () => {
    expect(isSchoolEmail('a@myedu.com')).toBe(false);   // "edu" not a label
    expect(isSchoolEmail('a@educated.org')).toBe(false);
    expect(isSchoolEmail('a@acme.co')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSchoolEmail('')).toBe(false);
    expect(isSchoolEmail('no-at-sign')).toBe(false);
    expect(isSchoolEmail('@virginia.edu')).toBe(false); // no local part
    expect(isSchoolEmail('a@')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/schoolEmail.test.ts`
Expected: FAIL — `Cannot find module './schoolEmail'` (or equivalent resolve error).

- [ ] **Step 4: Write minimal implementation**

Create `src/utils/schoolEmail.ts`:

```ts
// Academic-domain heuristic shared with the DB (public.is_school_email in
// public/school-email-schema.sql) — keep the two regexes in sync.
const SCHOOL_DOMAIN_RE = /(\.edu|\.edu\.[a-z]{2,}|\.ac\.[a-z]{2,})$/;

export function isSchoolEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return false;
  return SCHOOL_DOMAIN_RE.test(trimmed.slice(at + 1));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/schoolEmail.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/utils/schoolEmail.ts src/utils/schoolEmail.test.ts package.json package-lock.json
git commit -m "feat: add school email domain detection utility

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Server-side status enforcement (SQL schema file)

**Files:**
- Create: `public/school-email-schema.sql`

**Interfaces:**
- Produces: DB function `public.is_school_email(text) → boolean`; `BEFORE INSERT` trigger on `public.profiles` that overwrites `status`/`verified` from the email domain. No TS code consumes these directly — the trigger makes the DB the authority regardless of what the client sends (the existing `handle_new_user` auth trigger and the client-side fallback insert in `authContext.tsx:101` both pass through it).

- [ ] **Step 1: Create the SQL file**

Create `public/school-email-schema.sql`:

```sql
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
```

- [ ] **Step 2: Verify the regex matches the TS implementation**

Compare the regex literal in the SQL (`(\.edu|\.edu\.[a-z]{2,}|\.ac\.[a-z]{2,})$`) with `SCHOOL_DOMAIN_RE` in `src/utils/schoolEmail.ts` — they must be character-identical.

- [ ] **Step 3: (Manual — user) Run the SQL in Supabase Dashboard**

The implementer cannot run this. Note in the task report that the user must run `public/school-email-schema.sql` in the SQL Editor and confirm the sanity SELECT returns `true, true, false, false`.

- [ ] **Step 4: Commit**

```bash
git add public/school-email-schema.sql
git commit -m "feat: add school-email auto-approval schema and trigger

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: authContext — OTP verify/resend + needsVerification flags

**Files:**
- Modify: `src/utils/authContext.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4–6):
  - `export const PENDING_VERIFICATION_EMAIL_KEY = 'cc_pending_verification_email';`
  - `login(username, password): Promise<{ success: boolean; message: string; needsVerification?: boolean }>`
  - `register(data): Promise<{ success: boolean; message: string; needsVerification?: boolean }>`
  - `verifyEmailCode(email: string, code: string): Promise<{ success: boolean; message: string }>`
  - `resendVerificationCode(email: string): Promise<{ success: boolean; message: string }>`

- [ ] **Step 1: Export the sessionStorage key and extend the context type**

In `src/utils/authContext.tsx`, directly above `interface AuthContextType` (currently line 19), add:

```ts
// Email awaiting OTP verification, handed from Register/Login to VerifyEmailPage.
export const PENDING_VERIFICATION_EMAIL_KEY = 'cc_pending_verification_email';
```

Replace the `login`/`register` lines inside `AuthContextType` and add the two new methods, so the interface reads:

```ts
interface AuthContextType {
  user: User | null;
  currentUser: User | null;  // alias for user; consumed by chat/marketplace components
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string; needsVerification?: boolean }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message: string; needsVerification?: boolean }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ success: boolean; message: string }>;
  resendVerificationCode: (email: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => Promise<{ error: { message: string } | null }>;
  refreshUser: () => Promise<void>;
}
```

- [ ] **Step 2: Handle "Email not confirmed" in `login`**

Replace the body of `login` (currently `authContext.tsx:127-135`) with:

```ts
  const login = async (username: string, password: string) => {
    // Look up email by username via RPC (runs as SECURITY DEFINER, no public table read needed)
    const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
    if (rpcError || !email) return { success: false, message: 'Username not found' };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase rejects password sign-in until the signup OTP is confirmed.
      if (error.message.toLowerCase().includes('email not confirmed')) {
        sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, email as string);
        return { success: false, needsVerification: true, message: 'Please verify your email to continue.' };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Login successful' };
  };
```

- [ ] **Step 3: Make `register` report when OTP verification is needed**

Replace the tail of `register` (currently `authContext.tsx:156-160`, after the `signUp` call) with:

```ts
    if (authError) return { success: false, message: authError.message };
    if (!authData.user) return { success: false, message: 'Registration failed' };

    // With "Confirm email" enabled, signUp returns no session until the
    // emailed OTP is verified.
    if (!authData.session) {
      sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, data.email);
      return { success: true, needsVerification: true, message: 'We sent a verification code to your email.' };
    }

    return { success: true, message: 'Registration successful!' };
  };
```

- [ ] **Step 4: Add `verifyEmailCode` and `resendVerificationCode`**

Directly below the `register` function, add:

```ts
  const verifyEmailCode = async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
    if (error) return { success: false, message: error.message };
    sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
    // A session now exists; onAuthStateChange fetches the profile.
    return { success: true, message: 'Email verified!' };
  };

  const resendVerificationCode = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'A new code has been sent.' };
  };
```

- [ ] **Step 5: Expose the new methods in the provider value**

Find the `<AuthContext.Provider value={{ ... }}>` JSX at the bottom of the file and add `verifyEmailCode, resendVerificationCode` to the value object (alongside the existing `login, register, logout, ...`).

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils/authContext.tsx
git commit -m "feat: add OTP verify/resend and needsVerification handling to auth context

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: VerifyEmailPage + route registration

**Files:**
- Create: `src/VerifyEmailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes (from Task 3): `useAuth().verifyEmailCode`, `useAuth().resendVerificationCode`, `useAuth().user`, `PENDING_VERIFICATION_EMAIL_KEY` from `./utils/authContext`.
- Consumes (vendored): `InputOTP, InputOTPGroup, InputOTPSlot` from `./components/ui/input-otp`.
- Produces: default-export `VerifyEmailPage` component; hash route `#/verify-email` reachable while unauthenticated.

- [ ] **Step 1: Create the page component**

Create `src/VerifyEmailPage.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useAuth, PENDING_VERIFICATION_EMAIL_KEY } from './utils/authContext';
import { Button } from './components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './components/ui/input-otp';
import { MailCheck } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const { user, verifyEmailCode, resendVerificationCode } = useAuth();
  const [email] = useState(() => sessionStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY) ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // No pending email (deep link / refresh after success): nothing to verify here.
  useEffect(() => {
    if (!email) window.location.hash = '#/login';
  }, [email]);

  // After verifyOtp succeeds, onAuthStateChange loads the profile; route by status.
  useEffect(() => {
    if (verified && user) {
      window.location.hash = user.status === 'approved' ? '#/community' : '#/verification';
    }
  }, [verified, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async () => {
    if (code.length !== 6 || loading) return;
    setError('');
    setLoading(true);
    const result = await verifyEmailCode(email, code);
    setLoading(false);
    if (result.success) {
      setVerified(true);
    } else {
      setError(result.message);
      setCode('');
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    const result = await resendVerificationCode(email);
    if (result.success) {
      setInfo(result.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError(result.message);
    }
  };

  if (!email) return null;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-[#111] mb-2">Campus Connect</h1>
          <p className="text-[#666]">Verify your email</p>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <MailCheck className="w-8 h-8 text-[#0b5fff]" />
            </div>
          </div>

          <h2 className="text-[#111] mb-2">Check your inbox</h2>
          <p className="text-[#666] text-sm mb-6">
            We sent a 6-digit code to <span className="text-[#111]">{email}</span>.
            Enter it below to activate your account.
          </p>

          <div className="flex justify-center mb-6">
            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={handleVerify}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-blue-50 border border-blue-200 text-[#333] px-4 py-3 rounded-lg text-sm mb-4">
              {info}
            </div>
          )}

          <Button
            onClick={handleVerify}
            disabled={loading || verified || code.length !== 6}
            className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc] mb-4"
          >
            {verified ? 'Verified! Redirecting...' : loading ? 'Verifying...' : 'Verify Email'}
          </Button>

          <p className="text-sm text-[#666]">
            Didn't receive it?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="text-[#0b5fff] hover:underline disabled:text-[#999] disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </p>
        </div>

        <p className="text-center text-sm text-[#666] mt-6">
          <button
            type="button"
            onClick={() => (window.location.hash = '#/login')}
            className="text-[#666] hover:text-[#0b5fff] hover:underline"
          >
            Back to Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in App.tsx**

In `src/App.tsx`:

a) Add the import below the other page imports (after line 15):

```ts
import VerifyEmailPage from "./VerifyEmailPage";
```

b) Add `"verify-email"` to the `PageType` union (the list starting at line 21):

```ts
  | "verify-email"
```

c) In `handleHashChange`, directly after the `forgot-password` branch (lines 72–75), add — it must come **before** the `!isAuthenticated` check so unauthenticated users can reach it:

```ts
      if (hash === "verify-email") {
        setCurrentPage("verify-email");
        return;
      }
```

d) In the render section, after the `forgot-password` block (lines 144–146), add:

```tsx
  if (currentPage === "verify-email") {
    return <VerifyEmailPage />;
  }
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/VerifyEmailPage.tsx src/App.tsx
git commit -m "feat: add email verification code page and route

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: RegisterPage — school-email hint + redirect to code entry

**Files:**
- Modify: `src/RegisterPage.tsx`

**Interfaces:**
- Consumes: `isSchoolEmail` from `./utils/schoolEmail` (Task 1); `register(...).needsVerification` (Task 3); route `#/verify-email` (Task 4).

- [ ] **Step 1: Import the utility**

Add after the existing imports (line 7):

```ts
import { isSchoolEmail } from './utils/schoolEmail';
```

- [ ] **Step 2: Update the email field copy and add a live domain hint**

Replace the whole "Recovery Email" block (`RegisterPage.tsx:125-137`) with:

```tsx
            {/* School Email */}
            <div className="space-y-2">
              <Label htmlFor="email">School Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@university.edu"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                required
              />
              <p className="text-xs text-[#666]">We'll send a verification code to this address. Not shown to other users.</p>
              {formData.email.includes('@') && formData.email.split('@')[1]?.includes('.') && (
                isSchoolEmail(formData.email) ? (
                  <p className="text-xs text-green-600">
                    School email detected — your account activates as soon as you enter the code.
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Not a recognized school domain — after verifying the code, your account will also need admin approval.
                  </p>
                )
              )}
            </div>
```

- [ ] **Step 3: Route to the code-entry page on success**

Replace the success branch of `handleSubmit` (`RegisterPage.tsx:69-74`) with:

```ts
    if (!result.success) {
      setError(result.message);
    } else if (result.needsVerification) {
      window.location.hash = '#/verify-email';
    } else {
      // "Confirm email" disabled in Supabase: session exists immediately,
      // fall back to the status-based routing.
      window.location.hash = '#/verification';
    }
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/RegisterPage.tsx
git commit -m "feat: school-email hint on signup and redirect to code entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: LoginPage — route unconfirmed users to code entry

**Files:**
- Modify: `src/LoginPage.tsx`

**Interfaces:**
- Consumes: `login(...).needsVerification` (Task 3); route `#/verify-email` (Task 4).

- [ ] **Step 1: Handle the needsVerification result**

Replace `handleLogin` (`LoginPage.tsx:14-22`) with:

```ts
  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (!result.success) {
      if (result.needsVerification) {
        window.location.hash = '#/verify-email';
        return;
      }
      setError(result.message);
    }
  };
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/LoginPage.tsx
git commit -m "feat: send unconfirmed logins to the email verification page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Copy updates — VerificationPendingPage + README

**Files:**
- Modify: `src/VerificationPendingPage.tsx:116-126` ("What happens next?" box)
- Modify: `README.md` (인증 흐름 section + DB 스키마 목록)

**Interfaces:**
- Consumes: nothing; text-only.

- [ ] **Step 1: Update the pending explanation**

In `src/VerificationPendingPage.tsx`, replace the "What happens next?" box (lines 116–126) with:

```tsx
          <div className="bg-blue-50 border border-blue-200 text-[#333] px-4 py-3 rounded-lg text-sm mb-6">
            <p className="mb-2">
              <span className="text-[#111]">What happens next?</span>
            </p>
            <ul className="text-left space-y-1 text-xs">
              <li>• Your email domain isn't on our recognized school list, so an admin reviews it manually</li>
              <li>• School emails (.edu, .ac.kr, ...) are approved automatically — you can re-register with one anytime</li>
              <li>• You'll typically hear back within 24-48 hours</li>
              <li>• Once approved, you'll have full access to Campus Connect</li>
            </ul>
          </div>
```

- [ ] **Step 2: Update README**

In `README.md`:

a) In the "데이터베이스 스키마" list (section "### 3. 데이터베이스 스키마"), add after the `post-history-schema.sql` bullet:

```markdown
- `public/school-email-schema.sql` — 학교 도메인 자동 승인 함수(`is_school_email`)와 `profiles` BEFORE INSERT 트리거
```

b) Replace the "## 인증 흐름" section body with:

```markdown
1. 가입 → Supabase가 이메일로 6자리 인증 코드 발송 → `#/verify-email`에서 코드 입력
2. 학교 도메인(`.edu`, `.edu.*`, `.ac.*`) 이메일이면 코드 인증 즉시 `approved` — 바로 이용 가능
3. 그 외 도메인은 `pending`으로 생성되어 관리자가 Admin 페이지에서 승인/거절
4. 승인된 사용자만 메인 페이지 접근 가능 (라우터가 상태별로 강제 리다이렉트)
5. 비밀번호 재설정은 Supabase recovery 링크(`#type=recovery`)로 처리

> Supabase 대시보드에서 "Confirm email" 활성화와 Confirm signup 템플릿(`{{ .Token }}`) 설정이 필요합니다.
> 자세한 단계는 `public/school-email-schema.sql` 상단 주석 참고. 실서비스에서는 커스텀 SMTP 연결 필수.
```

c) "주요 기능"의 "가입 승인 워크플로" 불릿을 다음으로 교체:

```markdown
- **이메일 코드 인증 가입** — 가입 시 이메일로 6자리 코드를 보내 소유를 확인합니다. 학교 도메인(`.edu`, `.ac.kr` 등)은 자동 승인, 그 외 도메인은 관리자가 Admin 페이지에서 승인/거절하는 혼합 방식입니다.
```

- [ ] **Step 3: Verify the build and tests**

Run: `npm run build && npm test`
Expected: build succeeds; 6 Vitest tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/VerificationPendingPage.tsx README.md
git commit -m "docs: update pending-page copy and README for email code verification

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## End-to-End Manual Test (after all tasks + dashboard config)

1. `npm run dev` → register with a school email (e.g. `yourname@vt.edu` if you own one, or temporarily add your real domain to both regexes to test).
2. Expect redirect to `#/verify-email`; receive the 6-digit code by email; enter it → redirect to `#/community` (auto-approved).
3. Register with a non-school email (e.g. Gmail) → verify code → land on `#/verification` (pending); approve via an admin account → user gets in.
4. Register, close the tab before entering the code, then log in with that username → expect redirect to `#/verify-email`; "Resend code" works and then shows a 60s cooldown.
5. Enter a wrong code → error message shown, input cleared, can retry.
