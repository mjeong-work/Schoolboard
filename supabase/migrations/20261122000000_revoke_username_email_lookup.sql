-- =============================================================
-- Stop anyone turning a username into an email address.
--
-- get_email_by_username() was callable by anon so the login form could
-- resolve username -> email before sign-in; that also let anyone look up
-- a member's email. Login now takes the email directly (LoginPage /
-- authContext.login).
--
-- ORDER: apply only AFTER the email-login frontend is deployed. The
-- frontend before that (origin/main 8a610c5) still calls this RPC, and
-- its login breaks once EXECUTE is revoked.
--
-- The function is kept (not dropped) so a rollback is one GRANT:
--   GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO anon, authenticated;
-- =============================================================

REVOKE EXECUTE ON FUNCTION public.get_email_by_username(TEXT) FROM PUBLIC, anon, authenticated;
