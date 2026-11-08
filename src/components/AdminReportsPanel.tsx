import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flag, EyeOff, Eye, Trash2, CheckCircle, XCircle, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { getAnonymousName } from '../utils/anonymousName';
import {
  listPostReports,
  moderatePostReports,
  reportReasonLabel,
  MODERATOR_NOTE_MAX_LENGTH,
  type AdminPostReport,
  type ModerationAction,
  type ReportStatus,
} from '../utils/reports';

const STATUS_FILTERS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const STATUS_STYLE: Record<ReportStatus, string> = {
  pending: 'bg-[#fef3c7] text-[#b45309]',
  under_review: 'bg-[#e0e7ff] text-[#4338ca]',
  resolved: 'bg-[#d1fae5] text-[#047857]',
  dismissed: 'bg-[#f3f4f6] text-[#6b7280]',
};

const ACTION_LABEL: Record<string, string> = {
  none: 'No action on content',
  hidden: 'Post hidden',
  unhidden: 'Post restored',
  removed: 'Post removed',
};

// All reports about one post that are in the same status are handled as
// a single moderation case.
interface ReportGroup {
  key: string;
  postId: string;
  status: ReportStatus;
  reports: AdminPostReport[];
  latest: AdminPostReport;
}

function groupReports(reports: AdminPostReport[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.target_id}:${r.status}`;
    const g = map.get(key);
    if (g) {
      g.reports.push(r);
      if (r.created_at > g.latest.created_at) g.latest = r;
    } else {
      map.set(key, { key, postId: r.target_id, status: r.status, reports: [r], latest: r });
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

interface AdminReportsPanelProps {
  /** Reports pending review, for the tab label. */
  onPendingCountChange?: (count: number) => void;
  /** A post was hidden/restored/removed — lets the page refresh its own lists. */
  onContentChanged?: () => void;
}

export function AdminReportsPanel({ onPendingCountChange, onContentChanged }: AdminReportsPanelProps) {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');
  const [reports, setReports] = useState<AdminPostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      // Always fetch everything: the pending count needs it, and the list
      // is capped server-side.
      const data = await listPostReports();
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      setReports(data);
    } catch (err: any) {
      if (seq !== loadSeq.current) return;
      setLoadError(err?.message || 'Couldn’t load reports.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount = useMemo(() => reports.filter((r) => r.status === 'pending').length, [reports]);
  useEffect(() => { onPendingCountChange?.(pendingCount); }, [pendingCount, onPendingCountChange]);

  const groups = useMemo(
    () => groupReports(filter === 'all' ? reports : reports.filter((r) => r.status === filter)),
    [reports, filter],
  );

  // Applies a decision locally from the server's confirmed success instead
  // of re-downloading the whole queue.
  const applyLocally = (ids: string[], status: ReportStatus, action: ModerationAction, note: string) => {
    const taken = action === 'hide' ? 'hidden' : action === 'unhide' ? 'unhidden' : action === 'remove' ? 'removed' : null;
    const closed = status === 'resolved' || status === 'dismissed';
    const now = new Date().toISOString();
    setReports((prev) => {
      const target = prev.find((p) => ids.includes(p.id))?.target_id;
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
        // Content state is per post, so update every report about it.
        if (r.target_id !== target) return r;
        if (action === 'hide') return { ...r, post_hidden: true };
        if (action === 'unhide') return { ...r, post_hidden: false };
        if (action === 'remove') return { ...r, post_exists: false, post_hidden: false, live_content: null };
        return r;
      });
    });
  };

  return (
    <div className="font-[Roboto]">
      {/* Status filter */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {STATUS_FILTERS.map((f) => {
          const count = f.value === 'all' ? reports.length : reports.filter((r) => r.status === f.value).length;
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full border px-3 h-8 text-sm transition-colors ${
                active ? 'bg-black text-white border-black' : 'bg-white text-[#444] border-[#e5e5e5] hover:bg-[#f5f5f5]'
              }`}
            >
              {f.label}
              {!loading && <span className={`ml-1.5 ${active ? 'text-white/70' : 'text-[#999]'}`}>{count}</span>}
            </button>
          );
        })}
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
        <div className="py-12 text-center text-[#999] text-sm">Loading…</div>
      ) : loadError ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#dc2626] mb-3">{loadError}</p>
          <Button onClick={load} variant="outline" className="rounded-full">Try again</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="p-8 text-center text-[#666]">
          <Flag className="w-12 h-12 mx-auto mb-3 text-[#999]" />
          <p className="font-semibold">No {filter === 'all' ? '' : STATUS_FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} reports</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <ReportCase
              key={g.key}
              group={g}
              onApplied={(ids, status, action, note) => {
                applyLocally(ids, status, action, note);
                if (action !== 'none') onContentChanged?.();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReportCaseProps {
  group: ReportGroup;
  onApplied: (ids: string[], status: ReportStatus, action: ModerationAction, note: string) => void;
}

function ReportCase({ group, onApplied }: ReportCaseProps) {
  const { latest, reports, status, postId } = group;
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
  // Prefer the live post (it may have been edited since); fall back to the
  // snapshot taken when the first report came in.
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
      await moderatePostReports(ids, nextStatus, action, note);
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
        {!latest.post_exists ? (
          <span className="text-xs text-[#dc2626]">Post removed</span>
        ) : latest.post_hidden ? (
          <span className="text-xs text-[#b45309] flex items-center gap-1"><EyeOff className="w-3 h-3" />Hidden from feed</span>
        ) : (
          <span className="text-xs text-[#059669]">Visible in feed</span>
        )}
        <span className="text-xs text-[#999] ml-auto">Last reported {formatDateTime(latest.created_at)}</span>
      </div>

      {/* Reported content (alias only — no identities) */}
      <div className="rounded-xl bg-[#fafafa] border border-[#f0f0f0] p-3 mb-3">
        <div className="flex items-center gap-2 text-xs text-[#666] mb-1">
          <span>{getAnonymousName(postId)}</span>
          {content.category && <span>· {content.category}</span>}
          {edited && <span className="text-[#b45309]">· edited since reported</span>}
        </div>
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
          <span className="font-medium">{ACTION_LABEL[latest.action_taken ?? 'none']}</span>
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
        {isOpen && latest.post_exists && !latest.post_hidden && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('resolved', 'hide', 'Post hidden and reports resolved')} className="rounded-full gap-1.5">
            <EyeOff className="w-3.5 h-3.5" />Hide post &amp; resolve
          </Button>
        )}
        {latest.post_exists && latest.post_hidden && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(isOpen ? status : 'resolved', 'unhide', 'Post restored to the feed')} className="rounded-full gap-1.5">
            <Eye className="w-3.5 h-3.5" />Restore post
          </Button>
        )}
        {latest.post_exists && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRemove(true)} className="rounded-full gap-1.5 text-[#dc2626] border-[#fecaca] hover:bg-[#fef2f2]">
            <Trash2 className="w-3.5 h-3.5" />Remove post
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
        title="Remove this post?"
        description="The post is deleted for everyone and can’t be restored. The reports keep a copy of the reported text for the record."
        onConfirm={() => run('resolved', 'remove', 'Post removed and reports resolved')}
      />
    </div>
  );
}
