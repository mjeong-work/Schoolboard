-- =============================================================
-- Real Google Maps location support for marketplace listings —
-- replaces the removed fake "trade spot" mock data. Mirrors the
-- events table's location columns exactly (20260606000000) so the
-- same LocationAutocomplete / EventLocationMap components work
-- unchanged for marketplace listings.
--
-- The seller can optionally pick a real meetup spot via Google
-- Places when creating/editing a listing; unlike events this is
-- never required (many listings are handled purely over chat).
-- =============================================================

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS location_name          TEXT,
  ADD COLUMN IF NOT EXISTS location_address       TEXT,
  ADD COLUMN IF NOT EXISTS location_lat           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS google_place_id        TEXT,
  ADD COLUMN IF NOT EXISTS location_radius_meters INTEGER NOT NULL DEFAULT 150;

-- (seller/admin UPDATE policy for marketplace_items already exists —
-- added in 20260829000000_marketplace_hardening.sql — so editing the
-- location on an existing listing is already covered.)
