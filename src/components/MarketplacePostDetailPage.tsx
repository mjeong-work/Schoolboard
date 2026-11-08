import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, Heart, MessageCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { CommentsPanel } from './CommentsPanel';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { MarketplacePostGallery, MarketplacePostBody, useMarketplaceItemView } from './MarketplacePostDetail';
import { useMarketplaceItemActions } from '../utils/useMarketplaceItemActions';
import { useBackableOverlay } from '../utils/useBackableOverlay';
import type { MarketplaceItem } from '../utils/dataContext';

interface MarketplacePostDetailPageProps {
  item: MarketplaceItem;
  onBack: () => void;
  /** Opens the create/edit dialog pre-filled with this item. */
  onEdit?: (item: MarketplaceItem) => void;
}

// Mobile-only full-page post detail — replaces the old bottom sheet.
// Tapping a post now leaves the feed for a dedicated page instead of
// sliding a drawer up over it; the feed itself stays mounted underneath
// so scroll position is preserved automatically when the user goes back.
export function MarketplacePostDetailPage({ item, onBack, onEdit }: MarketplacePostDetailPageProps) {
  const {
    user,
    isSaved,
    isOwnItem,
    isAdmin,
    conversationCount,
    handleSave,
    handleContactSeller,
    handleDeleteItem,
    handleAddComment,
    handleDeleteComment,
  } = useMarketplaceItemActions(item);

  useMarketplaceItemView(item.id, true);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // This view covers the whole screen, so the feed behind it shouldn't
  // also scroll while it's open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Lets the device/browser back gesture close this page instead of
  // leaving Marketplace entirely — this page is otherwise just an
  // overlay with no history entry of its own.
  useBackableOverlay(true, onBack);

  const handleDeleteAndBack = async () => {
    // Only leave the page if the delete actually went through — if RLS
    // (or anything else) rejected it, handleDeleteItem already toasted
    // the error, and navigating back would wrongly imply it succeeded
    // while the listing is still there.
    const deleted = await handleDeleteItem();
    if (deleted) onBack();
  };

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col font-[Roboto] animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Top bar */}
      <div className="flex items-center gap-1 px-2 py-2.5 border-b border-[#f0f0f0] shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Marketplace"
          className="p-2 hover:bg-black/5 rounded-full transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-[#111]" />
        </button>
        <span className="flex-1 min-w-0 font-semibold text-[#111] truncate">{item.title}</span>
        {(isOwnItem || isAdmin) && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="p-2 text-[#999] hover:text-black hover:bg-black/5 rounded-full transition-colors shrink-0" aria-label="Post options">
                <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isOwnItem && (
                <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit?.(item)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit item
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="cursor-pointer text-red-600 focus:text-red-600"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ConfirmDeleteDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete this listing?"
        onConfirm={handleDeleteAndBack}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <MarketplacePostGallery images={item.images} title={item.title} roundedClassName="" />

        <div className="px-4 py-4">
          <MarketplacePostBody item={item} />

          {/* Engagement actions */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#f0f0f0]">
            <div className="flex items-center gap-4 text-[#aaa]">
              <button
                onClick={handleSave}
                className="flex items-center gap-1 hover:text-red-500 transition-colors group"
              >
                <Heart
                  className={`w-4 h-4 transition-all ${isSaved ? 'fill-red-500 text-red-500' : 'group-hover:scale-110'}`}
                  strokeWidth={1.5}
                />
                {item.savedBy.length > 0 && <span className="text-xs">{item.savedBy.length}</span>}
              </button>
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-xs">{item.views}</span>
              </div>
              <div className="flex items-center gap-1" title="People who contacted the seller">
                <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-xs">{conversationCount}</span>
              </div>
            </div>

            {!isOwnItem && (
              <Button
                onClick={handleContactSeller}
                className="bg-black hover:bg-black/80 text-white px-4 h-8 rounded-full text-sm font-[Roboto]"
              >
                Contact
              </Button>
            )}
          </div>

          {/* Comments */}
          <div className="mt-4 pt-4 border-t border-[#f0f0f0]">
            <CommentsPanel
              variant="page"
              comments={item.comments}
              currentUserId={user?.id}
              currentUserName={undefined}
              isAdmin={isAdmin}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
