import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Ban } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { NavigationBar } from './components/NavigationBar';
import { Button } from './components/ui/button';
import { getAvatarColor } from './utils/anonymousName';
import { useData } from './utils/dataContext';
import { listMyBlocks, unblock, type BlockedUser } from './utils/blocks';
import { BackendNotReadyError, CONTENT_NOUN } from './utils/reports';
import { BackendSetupNotice } from './components/BackendSetupNotice';

function formatBlockedDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Settings → Blocked accounts. Each row is the alias the person had where
 * they were blocked — aliases are per item, so it's the only name the
 * blocker ever saw. No user ids reach the client.
 */
export default function BlockedUsersPage() {
  const { refreshInBackground } = useData();
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setBlocks(await listMyBlocks());
      setNotReady(false);
    } catch (err: any) {
      if (err instanceof BackendNotReadyError) setNotReady(true);
      else setLoadError(err?.message || 'Couldn’t load your blocked accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = async (block: BlockedUser) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPendingId(block.id);
    try {
      await unblock(block.id);
      setBlocks((prev) => prev.filter((b) => b.id !== block.id));
      toast.success(`${block.source_alias || 'Account'} unblocked`);
      // Their content was filtered out server-side; bring it back quietly.
      refreshInBackground().catch(() => {});
    } catch (err: any) {
      toast.error(err?.message || 'Couldn’t unblock. Please try again.');
    } finally {
      pendingRef.current = false;
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="profile" />

      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-5 sm:py-6 font-[Roboto]">
        <a
          href="#/edit-profile"
          className="inline-flex items-center gap-1.5 text-sm text-[#666] hover:text-[#111] mb-3 -ml-1 px-1 py-1 rounded-md"
        >
          <ArrowLeft className="w-4 h-4" />
          Edit profile
        </a>
        <div className="mb-5">
          <h1 className="text-[#111] mb-1 font-[Bayon]">BLOCKED ACCOUNTS</h1>
          <p className="text-[#666]">
            You and these accounts can’t see or interact with each other’s posts, listings, events or comments. They aren’t told they’re blocked.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-[#999] text-sm">Loading…</div>
        ) : notReady ? (
          <BackendSetupNotice audience="member" feature="Blocking" migrations={['20261121000500_reports_moderation.sql', '20261121000600_user_blocks.sql']} onRetry={load} />
        ) : loadError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[#dc2626] mb-3">{loadError}</p>
            <Button onClick={load} variant="outline" className="rounded-full">Try again</Button>
          </div>
        ) : blocks.length === 0 ? (
          <div className="py-12 text-center text-[#666]">
            <Ban className="w-10 h-10 mx-auto mb-3 text-[#ccc]" />
            <p className="font-semibold text-[#111]">No blocked accounts</p>
            <p className="text-sm text-[#888] mt-1">You can block someone from the ⋯ menu on their post, listing, event or comment.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f0f0f0] border-t border-b border-[#f0f0f0]">
            {blocks.map((block) => {
              const alias = block.source_alias || 'Anonymous user';
              return (
                <li key={block.id} className="flex items-center gap-3 py-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                    style={{ background: getAvatarColor(block.id) }}
                  >
                    {alias.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#111] truncate">{alias}</p>
                    <p className="text-xs text-[#888]">
                      Blocked from a {CONTENT_NOUN[block.source_type]} · {formatBlockedDate(block.created_at)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() => handleUnblock(block)}
                    className="rounded-full shrink-0"
                  >
                    {pendingId === block.id ? 'Unblocking…' : 'Unblock'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
