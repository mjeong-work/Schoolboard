-- =============================================================
-- Remove the staging schema completely (needs approval).
-- Drops only staging and staging_private; production is untouched.
-- Dropping the schema also removes staging.messages from the Realtime
-- publication if it was added.
-- =============================================================

DROP SCHEMA IF EXISTS staging CASCADE;
DROP SCHEMA IF EXISTS staging_private CASCADE;

-- Then, by hand:
--   1. Dashboard > Project Settings > API > Exposed schemas: remove "staging".
--   2. Dashboard > Authentication > Users: delete the three staging test
--      users. That also deletes their pending rows in public.profiles
--      (ON DELETE CASCADE) and anything they uploaded is unaffected
--      because staging never uploads files.
