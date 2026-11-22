import { useRef, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { ReportDialog } from './ReportDialog';
import { useData } from '../utils/dataContext';
import { blockAuthorOf } from '../utils/blocks';
import type { ContentType } from '../utils/reports';

/** A piece of content someone can report, or block the author of. */
export interface SafetyTarget {
  type: ContentType;
  id: string;
  /** Used only to drop their content locally after a block — never sent to the server. */
  authorId: string;
  /** The anonymous name shown on this item; remembered in the blocked list. */
  alias: string;
}

/**
 * Report + Block for any card, detail page or comment. Call openReport /
 * openBlock from a menu item and render `dialogs` once in the component.
 * Open the menu with <DropdownMenu modal={false}> so the dialog isn't
 * left behind a Radix pointer-events lock.
 */
export function useContentSafety(options: { onBlocked?: () => void } = {}) {
  const [reportTarget, setReportTarget] = useState<SafetyTarget | null>(null);
  const [blockTarget, setBlockTarget] = useState<SafetyTarget | null>(null);

  const dialogs = (
    <>
      {reportTarget && (
        <ReportDialog
          open
          onOpenChange={(open) => { if (!open) setReportTarget(null); }}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
        />
      )}
      {blockTarget && (
        <BlockUserDialog
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
          onBlocked={options.onBlocked}
        />
      )}
    </>
  );

  return { openReport: setReportTarget, openBlock: setBlockTarget, dialogs };
}

interface BlockUserDialogProps {
  target: SafetyTarget;
  onClose: () => void;
  /** e.g. leave a detail page whose item is about to disappear. */
  onBlocked?: () => void;
}

function BlockUserDialog({ target, onClose, onBlocked }: BlockUserDialogProps) {
  const { removeContentByAuthor } = useData();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const handleBlock = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await blockAuthorOf(target.type, target.id, target.alias);
      onBlocked?.();
      removeContentByAuthor(target.authorId);
      toast.success(`${target.alias} is blocked`, {
        description: 'You can unblock them anytime from Edit profile → Blocked accounts.',
      });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Couldn’t block this account. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent className="font-[Roboto]">
        <AlertDialogHeader>
          <AlertDialogTitle>Block {target.alias}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-[#666]">
              <p>You won’t see each other’s posts, listings, events or comments anywhere in the app.</p>
              <p>Neither of you can like, comment on, save, RSVP to or message about the other’s content. Existing chats stay readable but you can’t send new messages.</p>
              <p>They won’t be told. You can unblock them later from Edit profile.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleBlock}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {busy ? 'Blocking…' : 'Block'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
