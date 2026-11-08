-- Admin-only identity reveal helpers.
-- Normal app screens should show anonymous aliases; these functions keep
-- identity lookup explicit for moderation/escalation cases.

CREATE OR REPLACE FUNCTION public.admin_reveal_post_author(p_post_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.name::TEXT, pr.email::TEXT
  FROM public.posts AS po
  JOIN public.profiles AS pr ON pr.id = po.author_id
  WHERE po.id = p_post_id
    AND public.is_admin();
$$;

CREATE OR REPLACE FUNCTION public.admin_reveal_listing_seller(p_item_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.name::TEXT, pr.email::TEXT
  FROM public.marketplace_items AS mi
  JOIN public.profiles AS pr ON pr.id = mi.seller_id
  WHERE mi.id = p_item_id
    AND public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_reveal_post_author(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reveal_listing_seller(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reveal_post_author(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reveal_listing_seller(UUID) TO authenticated;
