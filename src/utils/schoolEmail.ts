// Academic-domain heuristic shared with the DB (public.is_school_email in
// public/school-email-schema.sql) — keep the two regexes in sync.
const SCHOOL_DOMAIN_RE = /(\.edu|\.edu\.[a-z]{2,}|\.ac\.[a-z]{2,})$/;

export function isSchoolEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return false;
  return SCHOOL_DOMAIN_RE.test(trimmed.slice(at + 1));
}
