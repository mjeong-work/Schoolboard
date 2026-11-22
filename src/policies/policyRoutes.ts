// Public policy pages live at real paths (not hash routes) so they can be
// linked from app stores and opened without signing in.
export const POLICIES = [
  { slug: 'terms', path: '/terms', title: 'Terms of Service' },
  { slug: 'privacy', path: '/privacy', title: 'Privacy Policy' },
  { slug: 'community-guidelines', path: '/community-guidelines', title: 'Community Guidelines' },
  { slug: 'child-safety', path: '/child-safety', title: 'Child Safety Standards' },
] as const;

export type PolicySlug = (typeof POLICIES)[number]['slug'];

export function getPolicySlug(pathname: string): PolicySlug | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  return POLICIES.find((p) => p.path === path)?.slug ?? null;
}
