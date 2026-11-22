import { useEffect } from 'react';
import { Markdown } from './Markdown';
import { POLICIES, type PolicySlug } from './policyRoutes';
import terms from './content/terms.md?raw';
import privacy from './content/privacy.md?raw';
import communityGuidelines from './content/community-guidelines.md?raw';
import childSafety from './content/child-safety.md?raw';

const CONTENT: Record<PolicySlug, string> = {
  terms,
  privacy,
  'community-guidelines': communityGuidelines,
  'child-safety': childSafety,
};

// Public, sign-in-free page for one policy document. Rendered by App before
// any auth/data providers mount.
export default function PolicyPage({ slug }: { slug: PolicySlug }) {
  const policy = POLICIES.find((p) => p.slug === slug)!;

  useEffect(() => {
    document.title = `${policy.title} — School Board`;
    window.scrollTo(0, 0);
  }, [policy.title]);

  return (
    <div className="min-h-screen bg-white font-[Roboto]">
      <header className="border-b border-[#e5e5e5]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <a href="/" className="font-semibold text-[#111] hover:text-[#0b5fff]">
            School Board
          </a>
          <a href="/#/login" className="text-sm text-[#0b5fff] hover:underline">
            Sign in
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div
          role="note"
          className="mb-6 rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-3 text-sm text-[#78350f]"
        >
          <p className="font-semibold">DRAFT — Under Review</p>
          <p className="mt-1 leading-relaxed">
            This policy is a draft that is still being reviewed and may change before it is finalized.
            Items marked "to be confirmed" or "to be announced" have not been decided yet.
          </p>
        </div>

        <nav aria-label="Policies" className="mb-8 flex flex-wrap gap-2">
          {POLICIES.map((p) => (
            <a
              key={p.slug}
              href={p.path}
              aria-current={p.slug === slug ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                p.slug === slug
                  ? 'border-[#0b5fff] bg-[#0b5fff] text-white'
                  : 'border-[#e5e5e5] text-[#666] hover:border-[#0b5fff] hover:text-[#0b5fff]'
              }`}
            >
              {p.title}
            </a>
          ))}
        </nav>

        <article className="break-words">
          <Markdown source={CONTENT[slug]} />
        </article>
      </main>

      <footer className="border-t border-[#e5e5e5]">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-2 px-4 py-6 text-xs text-[#999]">
          {POLICIES.map((p) => (
            <a key={p.slug} href={p.path} className="hover:text-[#0b5fff] hover:underline">
              {p.title}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
