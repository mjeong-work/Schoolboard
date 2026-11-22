import { ChevronRight, FileText } from 'lucide-react';
import { POLICIES } from './policyRoutes';

// Policy pages open in a new tab from inside the app so an in-progress
// post, listing or message isn't lost.
const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

const DESCRIPTIONS: Record<(typeof POLICIES)[number]['slug'], string> = {
  terms: 'The rules for using Campus Connect',
  privacy: 'What we collect and how we use it',
  'community-guidelines': 'What is and isn’t allowed',
  'child-safety': 'Our zero-tolerance policy and how to report',
};

/** Small gray footnote row, e.g. at the bottom of the mobile menu. */
export function PolicyFootnote({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Policies" className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#999] font-[Roboto] ${className}`}>
      {POLICIES.map((p) => (
        <a key={p.slug} href={p.path} {...NEW_TAB} className="hover:text-[#0b5fff] hover:underline">
          {p.title}
        </a>
      ))}
    </nav>
  );
}

/** Settings-style rows, matching the "Blocked accounts" row in Edit Profile. */
export function PolicyLinkList() {
  return (
    <div>
      {POLICIES.map((p) => (
        <a
          key={p.slug}
          href={p.path}
          {...NEW_TAB}
          className="flex items-center justify-between gap-3 -mx-2 px-2 py-3 rounded-lg hover:bg-[#fafafa] transition-colors font-[Roboto]"
        >
          <span className="flex items-center gap-3 min-w-0">
            <FileText className="w-4 h-4 text-[#666] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm text-[#111]">{p.title}</span>
              <span className="block text-xs text-[#888]">{DESCRIPTIONS[p.slug]}</span>
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-[#999] shrink-0" />
        </a>
      ))}
    </div>
  );
}
