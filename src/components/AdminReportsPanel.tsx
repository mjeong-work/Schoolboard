import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flag, EyeOff, Eye, Trash2, CheckCircle, XCircle, Search, RefreshCw, ChevronRight, History, Inbox } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { BackendSetupNotice } from './BackendSetupNotice';
import { getAnonymousName } from '../utils/anonymousName';
import {
  listReports,
  listModerationHistory,
  moderateReports,
  reportReasonLabel,
  BackendNotReadyError,
  CONTENT_AREA,
  CONTENT_NOUN,
  MODERATOR_NOTE_MAX_LENGTH,
  type AdminReport,
  type ContentType,
  type ModerationAction,
  type ModerationHistoryEntry,
  type ReportStatus,
} from '../utils/reports';

export const REPORT_MIGRATIONS = [
  '20261121000500_reports_moderation.sql',
  '20261121000600_user_blocks.sql',
  '20261121000700_admin_dashboard.sql',
];

const STATUS_CARDS: { value: ReportStatus; label: string; accent: string }[] = [
  { value: 'pending', label: 'Pending', accent: '#d97706' },
  { value: 'under_review', label: 'Under review', accent: '#4338ca' },
  { value: 'resolved', label: 'Resolved', accent: '#047857' },
  { value: 'dismissed', label: 'Dismissed', accent: '#6b7280' },
];

const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: 'Pending',
  under_review: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

type TypeFilter = 'all' | 'posts' | 'comments' | 'listings' | 'events';

const TYPE_FILTERS: { value: TypeFilter; label: string; types: ContentType[] }[] = [
  { value: 'all', label: 'All content', types: [] },
  { value: 'posts', label: 'Posts', types: ['post'] },
  { value: 'listings', label: 'Listings', types: ['marketplace_item'] },
  { value: 'events', label: 'Events', types: ['event'] },
  { value: 'comments', label: 'Comments', types: ['post_comment', 'marketplace_comment', 'event_comment'] },
];

const STATUS_STYLE: Record<ReportStatus, string> = {
  pending: 'bg-[#fef3c7] text-[#b45309]',
  under_review: 'bg-[#e0e7ff] text-[#4338ca]',
  resolved: 'bg-[#d1fae5] text-[#047857]',
  dismissed: 'bg-[#f3f4f6] text-[#6b7280]',
};

function actionLabel(action: string | null, noun: string) {
  const cap = noun.charAt(0).toUpperCase() + noun.slice(1);
  switch (action) {
    case 'hidden': return `${cap} hidden`;
    case 'unhidden': return `${cap} restored`;
    case 'removed': return `${cap} removed`;
    default: return 'No action on content';
  }
}

// All reports about one piece of content that are in the same status are
// handled as a single moderation case.
interface ReportGroup {
  key: string;
  targetType: ContentType;
  targetId: string;
  status: ReportStatus;
  reports: AdminReport[];
  latest: AdminReport;
}

function groupReports(reports: AdminReport[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.target_type}:${r.target_id}:${r.status}`;
    const g = map.get(key);
    if (g) {
      g.reports.push(r);
      if (r.created_at > g.latest.created_at) g.latest = r;
    } else {
      map.set(key, { key, targetType: r.target_type, targetId: r.target_id, status: r.status, reports: [r], latest: r });
    }
  }
  return [...map.values()].sort((a, b) =>
    b.reports.length - a.reports.length || b.latest.created_at.localeCompare(a.latest.created_at),
  );
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** One-line preview of what was reported (live content, else the snapshot). */
function previewOf(group: ReportGroup) {
  const c = group.latest.live_content ?? group.latest.content_snapshot;
  const title = c.title && c.title !== c.content ? c.title : null;
  return { title, body: c.content ?? '' };
}

function reasonSummary(group: ReportGroup) {
  const counts = new Map<string, number>();
  group.reports.forEach((r) => counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1));
  const [top, ...rest] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return rest.length ? `${reportReasonLabel(top[0])} +${rest.length}` : reportReasonLabel(top[0]);
}

interface AdminReportsPanelProps {
  /** Status totals from the loaded queue, for the page's tab badge. */
  onCountsChange?: (counts: Record<ReportStatus, number>) => void;
  /** Content was hidden/restored/removed — lets the page refresh its own lists. */
  onContentChanged?: (type: ContentType) => void;
}

export function AdminReportsPanel({ onCountsChange, onContentChanged }: AdminReportsPanelProps) {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  // The open case, tracked by content + status so it follows a decision
  // (e.g. pending -> resolved) instead of disappearing from the sheet.
  const [selected, setSelected] = useState<{ type: ContentType; id: string; status: ReportStatus } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      // Always fetch everything: the counts need it, and the list is
      // capped server-side.
      const data = await listReports();
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      setReports(data);
      setNotReady(false);
    } catch (err: any) {
      if (seq !== loadSeq.current) return;
      if (err instanceof BackendNotReadyError) setNotReady(true);
      else setLoadError(err?.message || 'Couldn’t load reports.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reports matching the content-type filter; the status cards count within it.
  const typedReports = useMemo(() => {
    const types = TYPE_FILTERS.find((f) => f.value === typeFilter)?.types ?? [];
    return types.length === 0 ? reports : reports.filter((r) => types.includes(r.target_type));
  }, [reports, typeFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<ReportStatus, number> = { pending: 0, under_review: 0, resolved: 0, dismissed: 0 };
    typedReports.forEach((r) => { counts[r.status] += 1; });
    return counts;
  }, [typedReports]);

  const allCounts = useMemo(() => {
    const counts: Record<ReportStatus, number> = { pending: 0, under_review: 0, resolved: 0, dismissed: 0 };
    reports.forEach((r) => { counts[r.status] += 1; });
    return counts;
  }, [reports]);
  useEffect(() => { if (!loading && !notReady && !loadError) onCountsChange?.(allCounts); }, [allCounts, loading, notReady, loadError, onCountsChange]);

  const groups = useMemo(
    () => groupReports(filter === 'all' ? typedReports : typedReports.filter((r) => r.status === filter)),
    [typedReports, filter],
  );

  const selectedGroup = useMemo(() => {
    if (!selected) return null;
    return groupReports(reports).find(
      (g) => g.targetType === selected.type && g.targetId === selected.id && g.status === selected.status,
    ) ?? null;
  }, [reports, selected]);

  // Applies a decision locally from the server's confirmed success instead
  // of re-downloading the whole queue.
  const applyLocally = (ids: string[], status: ReportStatus, action: ModerationAction, note: string) => {
    const taken = action === 'hide' ? 'hidden' : action === 'unhide' ? 'unhidden' : action === 'remove' ? 'removed' : null;
    const closed = status === 'resolved' || status === 'dismissed';
    const now = new Date().toISOString();
    setReports((prev) => {
      const first = prev.find((p) => ids.includes(p.id));
      return prev.map((r) => {
        if (ids.includes(r.id)) {
          return {
            ...r,
            status,
            action_taken: taken ?? (closed ? r.action_taken ?? 'none' : r.action_taken),
            moderator_note: note.trim() || r.moderator_note,
            reviewed_at: closed ? now : r.reviewed_at,
          };
        }
        return r;
      }).map((r) => {
        // Content state is per item, so update every report about it.
        if (!first || r.target_type !== first.target_type || r.target_id !== first.target_id) return r;
        if (action === 'hide') return { ...r, target_hidden: true };
        if (action === 'unhide') return { ...r, target_hidden: false };
        if (action === 'remove') return { ...r, target_exists: false, target_hidden: false, live_content: null };
        return r;
      });
    });
  };

  if (notReady) {
    return <BackendSetupNotice feature="Reporting" migrations={REPORT_MIGRATIONS} onRetry={load} />;
  }

  return (
    <div className="font-[Roboto]">
      {/* Summary cards double as the status filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {STATUS_CARDS.map((c) => {
          const active = filter === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setFilter(active ? 'all' : c.value)}
              aria-pressed={active}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${
                active ? 'border-black bg-black/[0.03]' : 'border-[#f0f0f0] hover:bg-[#fafafa]'
              }`}
            >
              <div className="text-2xl font-semibold" style={{ color: c.accent }}>
                {loading && reports.length === 0 ? '—' : statusCounts[c.value]}
              </div>
              <div className="text-xs text-[#666] mt-0.5">{c.label}</div>
            </button>
          );
        })}
      </div>

      {/* Content-type filter + status reset + refresh */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              aria-pressed={active}
              className={`shrink-0 rounded-full px-2.5 h-7 text-xs transition-colors ${
                active ? 'bg-[#111]/[0.08] text-[#111] font-medium' : 'text-[#666] hover:bg-[#f5f5f5]'
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <span className="w-px h-4 bg-[#e5e5e5] mx-1 shrink-0" />
        <button
          onClick={() => setFilter('all')}
          aria-pressed={filter === 'all'}
          className={`shrink-0 rounded-full px-2.5 h-7 text-xs transition-colors ${
            filter === 'all' ? 'bg-[#111]/[0.08] text-[#111] font-medium' : 'text-[#666] hover:bg-[#f5f5f5]'
          }`}
        >
          All statuses
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto shrink-0 p-2 rounded-full hover:bg-[#f5f5f5] text-[#666] disabled:opacity-40"
          aria-label="Refresh reports"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && reports.length === 0 ? (
        <div className="py-12 text-center text-[#999] text-sm">Loading reports…</div>
      ) : loadError ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#dc2626] mb-3">{loadError}</p>
          <Button onClick={load} variant="outline" className="rounded-full">Try again</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="p-8 text-center text-[#666]">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-[#c4c4c4]" />
          <p className="font-semibold text-[#111]">
            No {filter === 'all' ? '' : STATUS_LABEL[filter].toLowerCase()} reports
            {typeFilter !== 'all' ? ` for ${TYPE_FILTERS.find((f) => f.value === typeFilter)?.label.toLowerCase()}` : ''}
          </p>
          {filter === 'pending' && <p className="text-sm text-[#888] mt-1">Nothing is waiting for review.</p>}
        </div>
      ) : (
        <div className="border border-[#f0f0f0] rounded-2xl overflow-hidden">
          {/* Column headers (desktop) */}
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_150px_110px_110px_20px] gap-3 px-4 py-2 bg-[#fafafa] text-[11px] uppercase tracking-wide text-[#888]">
            <span>Reported content</span>
            <span>Reason</span>
            <span>Last reported</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y divide-[#f0f0f0]">
            {groups.map((g) => {
              const { title, body } = previewOf(g);
              return (
                <li key={g.key}>
                  <button
                    onClick={() => setSelected({ type: g.targetType, id: g.targetId, status: g.status })}
                    className="w-full text-left px-4 py-3 hover:bg-[#fafafa] transition-colors md:grid md:grid-cols-[minmax(0,1fr)_150px_110px_110px_20px] md:gap-3 md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-[11px] text-[#666] bg-[#f3f4f6] rounded-full px-2 py-0.5">{CONTENT_AREA[g.targetType]}</span>
                        {g.reports.length > 1 && (
                          <span className="text-[11px] font-semibold text-[#b91c1c]">{g.reports.length} reports</span>
                        )}
                        {!g.latest.target_exists ? (
                          <span className="text-[11px] text-[#dc2626]">Removed</span>
                        ) : g.latest.target_hidden ? (
                          <span className="text-[11px] text-[#b45309]">Hidden</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-[#111] truncate">
                        {title && <span className="font-semibold">{title} · </span>}
                        <span className="text-[#444]">{body}</span>
                      </p>
                    </div>
                    {/* Mobile: compact meta line; desktop: columns */}
                    <div className="flex items-center gap-2 mt-1.5 md:hidden text-xs text-[#666]">
                      <Badge className={`${STATUS_STYLE[g.status]} border-0 text-[11px]`}>{STATUS_LABEL[g.status]}</Badge>
                      <span className="truncate">{reasonSummary(g)}</span>
                      <span className="ml-auto shrink-0 text-[#999]">{formatDateTime(g.latest.created_at)}</span>
                    </div>
                    <span className="hidden md:block text-xs text-[#b91c1c] truncate">{reasonSummary(g)}</span>
                    <span className="hidden md:block text-xs text-[#666]">{formatDateTime(g.latest.created_at)}</span>
                    <span className="hidden md:block">
                      <Badge className={`${STATUS_STYLE[g.status]} border-0 text-[11px]`}>{STATUS_LABEL[g.status]}</Badge>
                    </span>
                    <ChevronRight className="hidden md:block w-4 h-4 text-[#bbb]" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Detail view: the full case, its actions and its audit history */}
      <Sheet open={!!selectedGroup} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 gap-0 overflow-y-auto font-[Roboto]">
          {selectedGroup && (
            <>
              <div className="px-5 pt-5 pb-3 border-b border-[#f0f0f0]">
                <SheetTitle className="text-[#111]">Report details</SheetTitle>
                <SheetDescription className="text-xs">
                  {CONTENT_AREA[selectedGroup.targetType]} · shown by alias only — use Reveal on the Posts/Listings tabs only when escalation requires it.
                </SheetDescription>
              </div>
              <div className="p-4">
                <ReportCase
                  key={selectedGroup.key}
                  group={selectedGroup}
                  onApplied={(ids, status, action, note) => {
                    applyLocally(ids, status, action, note);
                    setSelected({ type: selectedGroup.targetType, id: selectedGroup.targetId, status });
                    setHistoryVersion((v) => v + 1);
                    if (action !== 'none') onContentChanged?.(selectedGroup.targetType);
                  }}
                />
                <ModerationHistory
                  targetType={selectedGroup.targetType}
                  targetId={selectedGroup.targetId}
                  version={historyVersion}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const HISTORY_ACTION_LABEL: Record<string, string> = {
  none: 'Status change',
  hide: 'Hid content',
  unhide: 'Restored content',
  remove: 'Removed content',
};

function ModerationHistory({ targetType, targetId, version }: { targetType: ContentType; targetId: string; version: number }) {
  const [entries, setEntries] = useState<ModerationHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listModerationHistory(targetType, targetId)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof BackendNotReadyError
          ? 'Audit history needs migration 20261121000700_admin_dashboard.sql.'
          : err?.message || 'Couldn’t load the moderation history.');
      });
    return () => { cancelled = true; };
  }, [targetType, targetId, version]);

  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#111] mb-2">
        <History className="w-4 h-4" />
        Audit history
      </h3>
      {error ? (
        <p className="text-xs text-[#888]">{error}</p>
      ) : entries === null ? (
        <p className="text-xs text-[#999]">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[#888]">No decisions recorded yet.</p>
      ) : (
        <ol className="border-l border-[#e5e5e5] ml-1.5 space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="pl-3 relative">
              <span className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full bg-[#d4d4d8]" />
              <p className="text-xs text-[#111]">
                <span className="font-medium">{HISTORY_ACTION_LABEL[e.action] ?? e.action}</span>
                {e.status && <> → {STATUS_LABEL[e.status as ReportStatus] ?? e.status}</>}
                <span className="text-[#888]"> · {e.by_me ? 'you' : 'another admin'} · {formatDateTime(e.created_at)}</span>
              </p>
              {e.note && <p className="text-xs text-[#555] mt-0.5 whitespace-pre-wrap break-words">“{e.note}”</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface ReportCaseProps {
  group: ReportGroup;
  onApplied: (ids: string[], status: ReportStatus, action: ModerationAction, note: string) => void;
}

function ReportCase({ group, onApplied }: ReportCaseProps) {
  const { latest, reports, status, targetId, targetType } = group;
  const noun = CONTENT_NOUN[targetType];
  const isComment = targetType.endsWith('_comment');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busyRef = useRef(false);

  const reasonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    reports.forEach((r) => counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [reports]);

  const notes = reports.filter((r) => r.details);
  // Prefer the live content (it may have been edited since); fall back to
  // the snapshot taken when the first report came in.
  const content = latest.live_content ?? latest.content_snapshot;
  const edited =
    latest.live_content &&
    (latest.live_content.content !== latest.content_snapshot.content ||
      latest.live_content.title !== latest.content_snapshot.title);
  const isOpen = status === 'pending' || status === 'under_review';
  const ids = reports.map((r) => r.id);

  const run = async (nextStatus: ReportStatus, action: ModerationAction = 'none', success: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await moderateReports(ids, nextStatus, action, note);
      onApplied(ids, nextStatus, action, note);
      setNote('');
      toast.success(success);
    } catch (err: any) {
      toast.error(err?.message || 'Couldn’t save that decision.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="border border-[#f0f0f0] rounded-2xl p-4 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge className={`${STATUS_STYLE[status]} border-0 text-xs`}>
          {status === 'under_review' ? 'Under review' : status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
        <span className="text-sm font-semibold text-[#111]">
          {reports.length} report{reports.length === 1 ? '' : 's'}
        </span>
        <span className="text-xs text-[#666] bg-[#f3f4f6] rounded-full px-2 py-0.5">{CONTENT_AREA[targetType]}</span>
        {!latest.target_exists ? (
          <span className="text-xs text-[#dc2626]">Removed</span>
        ) : latest.target_hidden ? (
          <span className="text-xs text-[#b45309] flex items-center gap-1"><EyeOff className="w-3 h-3" />Hidden</span>
        ) : (
          <span className="text-xs text-[#059669]">Visible</span>
        )}
        <span className="text-xs text-[#999] ml-auto">Last reported {formatDateTime(latest.created_at)}</span>
      </div>

      {/* Reported content (alias only — no identities) */}
      <div className="rounded-xl bg-[#fafafa] border border-[#f0f0f0] p-3 mb-3">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#666] mb-1">
          <span>{getAnonymousName(targetId)}</span>
          {content.category && <span>· {content.category}</span>}
          {content.price != null && <span>· ${Number(content.price).toLocaleString('en-US')}</span>}
          {content.event_date && <span>· {content.event_date}</span>}
          {edited && <span className="text-[#b45309]">· edited since reported</span>}
        </div>
        {isComment && content.parent_title && (
          <p className="text-xs text-[#999] mb-1 truncate">On “{content.parent_title}”</p>
        )}
        {content.title && content.title !== content.content && (
          <p className="text-sm font-semibold text-[#111] mb-0.5 break-words">{content.title}</p>
        )}
        <p className="text-sm text-[#333] whitespace-pre-wrap break-words line-clamp-6">{content.content}</p>
        {content.image_url && (
          <img
            src={content.image_url}
            alt=""
            loading="lazy"
            className="mt-2 max-h-40 rounded-lg border border-[#f0f0f0] object-cover"
          />
        )}
      </div>

      {/* Reasons */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {reasonCounts.map(([reason, count]) => (
          <span key={reason} className="text-xs rounded-full bg-[#fef2f2] text-[#b91c1c] px-2 py-0.5">
            {reportReasonLabel(reason)}{count > 1 ? ` ×${count}` : ''}
          </span>
        ))}
      </div>
      {notes.length > 0 && (
        <ul className="mb-3 space-y-1">
          {notes.map((r) => (
            <li key={r.id} className="text-xs text-[#555] border-l-2 border-[#e5e5e5] pl-2 break-words">
              “{r.details}”
            </li>
          ))}
        </ul>
      )}

      {/* Decision record */}
      {!isOpen && (
        <div className="text-xs text-[#555] bg-[#f9fafb] rounded-lg px-3 py-2 mb-3">
          <span className="font-medium">{actionLabel(latest.action_taken, noun)}</span>
          {' · '}reviewed {formatDateTime(latest.reviewed_at)}
          {latest.moderator_note && <p className="mt-1 whitespace-pre-wrap break-words">Note: {latest.moderator_note}</p>}
        </div>
      )}

      {/* Actions */}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, MODERATOR_NOTE_MAX_LENGTH))}
        placeholder={isOpen ? 'Decision note (optional, saved with the decision)' : 'Note for reopening (optional)'}
        disabled={busy}
        className="border-[#e5e7eb] rounded-lg min-h-[56px] text-sm mb-2"
      />
      <div className="flex flex-wrap gap-2">
        {status === 'pending' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('under_review', 'none', 'Marked as under review')} className="rounded-full gap-1.5">
            <Search className="w-3.5 h-3.5" />Start review
          </Button>
        )}
        {isOpen && latest.target_exists && !latest.target_hidden && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('resolved', 'hide', `${actionLabel('hidden', noun)}, reports resolved`)} className="rounded-full gap-1.5">
            <EyeOff className="w-3.5 h-3.5" />Hide {noun} &amp; resolve
          </Button>
        )}
        {latest.target_exists && latest.target_hidden && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(isOpen ? status : 'resolved', 'unhide', actionLabel('unhidden', noun))} className="rounded-full gap-1.5">
            <Eye className="w-3.5 h-3.5" />Restore {noun}
          </Button>
        )}
        {latest.target_exists && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRemove(true)} className="rounded-full gap-1.5 text-[#dc2626] border-[#fecaca] hover:bg-[#fef2f2]">
            <Trash2 className="w-3.5 h-3.5" />Remove {noun}
          </Button>
        )}
        {isOpen && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('resolved', 'none', 'Reports resolved')} className="rounded-full gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />Resolve
          </Button>
        )}
        {isOpen && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('dismissed', 'none', 'Reports dismissed')} className="rounded-full gap-1.5">
            <XCircle className="w-3.5 h-3.5" />Dismiss
          </Button>
        )}
        {!isOpen && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('under_review', 'none', 'Reopened for review')} className="rounded-full gap-1.5">
            <Search className="w-3.5 h-3.5" />Reopen
          </Button>
        )}
      </div>

      <ConfirmDeleteDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove this ${noun}?`}
        description={`The ${noun} is deleted for everyone and can’t be restored. The reports keep a copy of the reported text for the record.`}
        onConfirm={() => run('resolved', 'remove', `${actionLabel('removed', noun)}, reports resolved`)}
      />
    </div>
  );
}
