-- Marketplace conversations should not persist real profile names in chat
-- participant labels or message sender labels.

UPDATE public.conversation_participants AS cp
SET user_name = CASE
  WHEN mi.seller_id = cp.user_id THEN 'Anonymous Seller'
  WHEN mi.id IS NOT NULL THEN 'Anonymous Buyer'
  ELSE 'Anonymous User'
END
FROM public.conversations AS c
LEFT JOIN public.marketplace_items AS mi
  ON mi.id::TEXT = c.context_item_id
WHERE cp.conversation_id = c.id
  AND c.context_type = 'marketplace';

UPDATE public.messages AS m
SET sender_name = CASE
  WHEN mi.seller_id = m.sender_id THEN 'Anonymous Seller'
  WHEN mi.id IS NOT NULL THEN 'Anonymous Buyer'
  ELSE 'Anonymous User'
END
FROM public.conversations AS c
LEFT JOIN public.marketplace_items AS mi
  ON mi.id::TEXT = c.context_item_id
WHERE m.conversation_id = c.id
  AND c.context_type = 'marketplace';
