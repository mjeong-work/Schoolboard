import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from './ui/drawer';
import { CommentsPanel } from './CommentsPanel';
import type { Comment } from '../utils/dataContext';
import type { CommentContentType } from '../utils/reports';

interface CommentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comments: Comment[];
  currentUserId?: string;
  currentUserName?: string;
  isAdmin?: boolean;
  onAddComment: (text: string) => void | Promise<void>;
  onDeleteComment?: (commentId: string) => void | Promise<void>;
  commentType?: CommentContentType;
}

// Mobile-only bottom sheet — slides up from the bottom of the screen.
// On desktop, MarketplaceCard renders <CommentsPanel variant="inline">
// directly instead of this, so comments expand within the post card.
export function CommentsSheet({
  open,
  onOpenChange,
  comments,
  currentUserId,
  currentUserName,
  isAdmin,
  onAddComment,
  onDeleteComment,
  commentType,
}: CommentsSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] font-[Roboto]">
        <DrawerTitle className="sr-only">Comments</DrawerTitle>
        <DrawerDescription className="sr-only">View and add comments</DrawerDescription>

        <CommentsPanel
          variant="sheet"
          comments={comments}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isAdmin={isAdmin}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
          commentType={commentType}
        />
      </DrawerContent>
    </Drawer>
  );
}
