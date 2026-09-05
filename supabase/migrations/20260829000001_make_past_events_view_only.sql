-- Keep past events visible and commentable, but prevent normal event-state
-- changes after the event date has passed.

DROP POLICY IF EXISTS "author can update events" ON public.events;
CREATE POLICY "author can update events"
  ON public.events FOR UPDATE
  USING (auth.uid() = author_id AND date >= CURRENT_DATE)
  WITH CHECK (auth.uid() = author_id AND date >= CURRENT_DATE);

DROP POLICY IF EXISTS "users can manage own rsvps" ON public.event_rsvps;
CREATE POLICY "users can manage own rsvps"
  ON public.event_rsvps FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.events
      WHERE id = event_id
        AND date >= CURRENT_DATE
    )
  );

DROP POLICY IF EXISTS "users can delete own rsvps" ON public.event_rsvps;
CREATE POLICY "users can delete own rsvps"
  ON public.event_rsvps FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.events
      WHERE id = event_id
        AND date >= CURRENT_DATE
    )
  );

DROP POLICY IF EXISTS "users can manage own event likes" ON public.event_likes;
CREATE POLICY "users can manage own event likes"
  ON public.event_likes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.events
      WHERE id = event_id
        AND date >= CURRENT_DATE
    )
  );

DROP POLICY IF EXISTS "users can delete own event likes" ON public.event_likes;
CREATE POLICY "users can delete own event likes"
  ON public.event_likes FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.events
      WHERE id = event_id
        AND date >= CURRENT_DATE
    )
  );
