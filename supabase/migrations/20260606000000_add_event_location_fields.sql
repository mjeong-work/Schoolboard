-- Add Google Maps structured location fields to the events table.
-- Existing rows keep their venue text; new columns default to NULL / 300.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS location_name          TEXT,
  ADD COLUMN IF NOT EXISTS location_address       TEXT,
  ADD COLUMN IF NOT EXISTS location_lat           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS google_place_id        TEXT,
  ADD COLUMN IF NOT EXISTS location_radius_meters INTEGER NOT NULL DEFAULT 300;

-- Allow event authors to update their own events (required for editing location).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'events'
      AND policyname = 'author can update events'
  ) THEN
    CREATE POLICY "author can update events"
      ON public.events FOR UPDATE
      USING  (auth.uid() = author_id)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;
