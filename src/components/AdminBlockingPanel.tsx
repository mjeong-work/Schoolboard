import { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { BackendSetupNotice } from './BackendSetupNotice';
import { fetchBlockStats, type BlockStats } from '../utils/blocks';
import { BackendNotReadyError, CONTENT_AREA, type ContentType } from '../utils/reports';
import { REPORT_MIGRATIONS } from './AdminReportsPanel';

interface AdminBlockingPanelProps {
  /** Jump to the Reports tab (for the "blocked while reported" signal). */
  onOpenReports?: () => void;
}

/**
 * Admin view of blocking. Aggregate numbers only: who blocked whom is
 * never loaded, so a curious admin can't browse users' block lists.
 * The two "needs attention" figures are counts of accounts, which is
 * enough to tell whether the Reports queue deserves a closer look.
 */
export function AdminBlockingPanel({ onOpenReports }: AdminBlockingPanelProps) {
  const [stats, setStats] = useState<BlockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchBlockStats());
      setNotReady(false);
    } catch (err: any) {
      if (err instanceof BackendNotReadyError) setNotReady(true);
      else setError(err?.message || 'Couldn’t load blocking statistics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const policy = (
    <section className="mt-6 rounded-2xl border border-[#f0f0f0] p-4 sm:p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#111] mb-2">
        <ShieldCheck className="w-4 h-4 text-[#047857]" />
        How blocking works
      </h3>
      <ul className="text-sm text-[#555] space-y-1 list-disc pl-5">
        <li>Two-way: neither person sees the other’s posts, listings, events or comments.</li>
        <li>No likes, comments, saves, RSVPs or new messages between them; existing chats stay readable.</li>
        <li>The blocked person isn’t told. Admins still see everything, so moderation isn’t affected.</li>
        <li>Enforced by database policies, not just hidden in the app.</li>
        <li>Individual block relationships are private and aren’t shown here.</li>
      </ul>
      <a
        href="#/blocked-users"
        className="mt-3 inline-flex items-center gap-1 text-sm text-[#0b5fff] hover:underline"
      >
        Manage the accounts you’ve blocked
        <ChevronRight className="w-4 h-4" />
      </a>
    </section>
  );

  if (notReady) {
    return (
      <div className="font-[Roboto]">
        <BackendSetupNotice feature="Blocking statistics" migrations={REPORT_MIGRATIONS} onRetry={load} />
        {policy}
      </div>
    );
  }

  const cards: { label: string; value: number | undefined; hint?: string }[] = [
    { label: 'Active blocks', value: stats?.total_blocks },
    { label: 'New in last 7 days', value: stats?.blocks_last_7_days },
    { label: 'New in last 30 days', value: stats?.blocks_last_30_days },
    { label: 'Accounts using block', value: stats?.accounts_blocking },
  ];

  const sources = Object.entries(stats?.by_source ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const attention = (stats?.accounts_blocked_by_3_plus ?? 0) + (stats?.blocked_with_open_reports ?? 0);

  return (
    <div className="font-[Roboto]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[#666]">Aggregate numbers only — no user identities or block lists.</p>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 p-2 rounded-full hover:bg-[#f5f5f5] text-[#666] disabled:opacity-40"
          aria-label="Refresh blocking statistics"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#dc2626] mb-3">{error}</p>
          <Button onClick={load} variant="outline" className="rounded-full">Try again</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-[#f0f0f0] px-4 py-3">
                <div className="text-2xl font-semibold text-[#111]">{loading && !stats ? '—' : c.value ?? 0}</div>
                <div className="text-xs text-[#666] mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Operational signals */}
          <section className={`mt-4 rounded-2xl border p-4 ${attention > 0 ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#f0f0f0]'}`}>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#111] mb-2">
              {attention > 0 ? <AlertTriangle className="w-4 h-4 text-[#b45309]" /> : <Ban className="w-4 h-4 text-[#666]" />}
              Needs attention
            </h3>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[#666]">Accounts blocked by 3 or more people</dt>
                <dd className="text-xl font-semibold text-[#111]">{loading && !stats ? '—' : stats?.accounts_blocked_by_3_plus ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[#666]">Blocked accounts with open reports</dt>
                <dd className="text-xl font-semibold text-[#111]">{loading && !stats ? '—' : stats?.blocked_with_open_reports ?? 0}</dd>
              </div>
            </dl>
            <p className="text-xs text-[#888] mt-2">
              Repeated blocking can point to harassment. Review the open reports — they’re where content can be hidden or removed.
            </p>
            {onOpenReports && (
              <Button onClick={onOpenReports} variant="outline" size="sm" className="rounded-full mt-3">
                Open Reports
              </Button>
            )}
          </section>

          {/* Where blocks start */}
          {sources.length > 0 && (
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-[#111] mb-2">Where people block from</h3>
              <ul className="divide-y divide-[#f0f0f0] border-y border-[#f0f0f0]">
                {sources.map(([type, n]) => (
                  <li key={type} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[#444]">{CONTENT_AREA[type as ContentType] ?? type}</span>
                    <span className="font-medium text-[#111]">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {policy}
    </div>
  );
}
