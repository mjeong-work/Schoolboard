-- Event conversations should not persist real profile names in chat
-- participant labels or message sender labels.

UPDATE public.conversation_participants AS cp
SET user_name = CASE
  WHEN ev.author_id = cp.user_id THEN 'Anonymous Host'
  WHEN ev.id IS NOT NULL THEN 'Anonymous Attendee'
  ELSE 'Anonymous User'
END
FROM public.conversations AS c
LEFT JOIN public.events AS ev
  ON ev.id::TEXT = c.context_item_id
WHERE cp.conversation_id = c.id
  AND c.context_type = 'event';

UPDATE public.messages AS m
SET sender_name = CASE
  WHEN ev.author_id = m.sender_id THEN 'Anonymous Host'
  WHEN ev.id IS NOT NULL THEN 'Anonymous Attendee'
  ELSE 'Anonymous User'
END
FROM public.conversations AS c
LEFT JOIN public.events AS ev
  ON ev.id::TEXT = c.context_item_id
WHERE m.conversation_id = c.id
  AND c.context_type = 'event';
