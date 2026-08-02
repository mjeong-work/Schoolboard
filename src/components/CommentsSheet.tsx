import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ImageIcon, AtSign, MoreHorizontal, Send } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { Button } from './ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from './ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner@2.0.3';
import type { Comment } from '../utils/dataContext';

interface CommentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comments: Comment[];
  currentUserId?: string;
  currentUserName?: string;
  isAdmin?: boolean;
  onAddComment: (text: string) => void | Promise<void>;
  onDeleteComment?: (commentId: string) => void | Promise<void>;
}

type SortMode = 'relevant' | 'oldest';

function formatCommentDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Comments and events don't have a like/photo-attachment concept in the
// backend today. Rather than fake persistence for them, these show an
// honest "not available yet" toast instead of silently doing nothing.
function notYetAvailable(feature: string) {
  toast(`${feature} isn't available yet.`);
}

export function CommentsSheet({
  open,
  onOpenChange,
  comments,
  currentUserId,
  currentUserName,
  isAdmin,
  onAddComment,
  onDeleteComment,
}: CommentsSheetProps) {
  const [commentText, setCommentText] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('relevant');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedComments = useMemo(() => {
    const copy = [...comments];
    copy.sort((a, b) => {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sortMode === 'oldest' ? diff : -diff;
    });
    return copy;
  }, [comments, sortMode]);

  const handleSubmit = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddComment(commentText.trim());
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = (authorName: string) => {
    setCommentText(`@${authorName} `);
    inputRef.current?.focus();
  };

  const insertMention = () => {
    setCommentText((prev) => (prev.endsWith(' ') || !prev ? `${prev}@` : `${prev} @`));
    inputRef.current?.focus();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] font-[Roboto]">
        <DrawerTitle className="sr-only">Comments</DrawerTitle>
        <DrawerDescription className="sr-only">View and add comments</DrawerDescription>

        {/* Sort control */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-[#f0f0f0]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-sm font-semibold text-[#111] hover:bg-black/5 rounded-full px-2 py-1 -ml-2 transition-colors">
                {sortMode === 'relevant' ? 'Most relevant' : 'Oldest first'}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSortMode('relevant')}>Most relevant</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('oldest')}>Oldest first</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {sortedComments.length === 0 ? (
            <p className="text-sm text-[#999] text-center py-8">No comments yet. Be the first to reply.</p>
          ) : (
            <div className="space-y-4">
              {sortedComments.map((comment) => {
                const isOwnComment = currentUserId === comment.authorId;
                return (
                  <div key={comment.id} className="flex gap-2.5">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                      style={{ background: getAvatarColor(comment.authorId) }}
                    >
                      {comment.author.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-[#f5f5f5] rounded-2xl px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-[#111]">{comment.author}</span>
                          {(isOwnComment || isAdmin) && onDeleteComment && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 -mr-1 -mt-0.5 hover:bg-black/5 rounded-full transition-colors shrink-0">
                                  <MoreHorizontal className="w-3.5 h-3.5 text-[#999]" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => onDeleteComment(comment.id)}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <p className="text-sm text-[#111] leading-relaxed">{comment.text}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-1 ml-3">
                        <span className="text-xs text-[#999]">{formatCommentDate(comment.date)}</span>
                        <button
                          onClick={() => notYetAvailable('Liking comments')}
                          className="text-xs font-semibold text-[#666] hover:text-[#111] transition-colors"
                        >
                          Like
                        </button>
                        <button
                          onClick={() => handleReply(comment.author)}
                          className="text-xs font-semibold text-[#666] hover:text-[#111] transition-colors"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed composer */}
        <div className="border-t border-[#f0f0f0] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
              style={{ background: getAvatarColor(currentUserId || '') }}
            >
              {currentUserName?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 flex items-center gap-1 bg-[#f5f5f5] rounded-full pl-4 pr-1.5 h-10">
              <input
                ref={inputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Leave your thoughts here..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#999] min-w-0"
              />
              <button
                type="button"
                onClick={() => notYetAvailable('Photo attachments')}
                className="p-1.5 hover:bg-black/5 rounded-full transition-colors shrink-0"
                aria-label="Attach photo"
              >
                <ImageIcon className="w-4 h-4 text-[#666]" />
              </button>
              <button
                type="button"
                onClick={insertMention}
                className="p-1.5 hover:bg-black/5 rounded-full transition-colors shrink-0"
                aria-label="Mention someone"
              >
                <AtSign className="w-4 h-4 text-[#666]" />
              </button>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!commentText.trim() || submitting}
              className="rounded-full bg-black hover:bg-black/80 text-white h-9 px-4 disabled:opacity-30 shrink-0"
            >
              <Send className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Comment</span>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
