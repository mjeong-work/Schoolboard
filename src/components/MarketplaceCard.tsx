import { useState } from 'react';
import { Heart, Eye, MessageCircle, MessageSquare, Trash2, Pencil, MoreHorizontal, ChevronUp, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useMarketplaceItemActions } from '../utils/useMarketplaceItemActions';
import type { MarketplaceItem } from '../utils/dataContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { CommentsSheet } from './CommentsSheet';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { CommentsPanel } from './CommentsPanel';
import { MarketplacePostGallery, MarketplacePostBody, useMarketplaceItemView, formatPrice } from './MarketplacePostDetail';
import { useIsMobile } from './ui/use-mobile';

interface MarketplaceCardProps {
  item: MarketplaceItem;
  /** Mobile only — opens the full-page post detail for this item. */
  onOpenDetail?: (itemId: string) => void;
  /** Opens the create/edit dialog pre-filled with this item. */
  onEdit?: (item: MarketplaceItem) => void;
}

// Desktop's single expansion state for "this post" — comments are just
// one more thing the expanded post can show, not a competing overlay.
// compact           -> feed row only
// expanded          -> + full gallery/body inline
// expanded-comments -> + comments, still part of the same expanded card
type DesktopView = 'compact' | 'expanded' | 'expanded-comments';

export function MarketplaceCard({ item, onOpenDetail, onEdit }: MarketplaceCardProps) {
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
  const isMobile = useIsMobile();

  const [isCommentsOpen, setIsCommentsOpen] = useState(false); // mobile bottom sheet only
  const [desktopView, setDesktopView] = useState<DesktopView>('compact');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Expanding the post on desktop is a genuine "view", same as opening
  // the mobile full-page detail.
  useMarketplaceItemView(item.id, !isMobile && desktopView !== 'compact');

  // Mobile: leave the feed for the full-page detail. Desktop: toggle this
  // exact card between compact and expanded in place.
  const handleOpenPost = () => {
    if (isMobile) {
      onOpenDetail?.(item.id);
      return;
    }
    setDesktopView((v) => (v === 'compact' ? 'expanded' : 'compact'));
  };

  // Mobile: unchanged bottom sheet. Desktop: comments are part of the
  // expanded post — opening them expands the post too if it wasn't
  // already, and closing them just drops back to "expanded" rather than
  // collapsing the whole card.
  const handleToggleComments = () => {
    if (isMobile) {
      setIsCommentsOpen((v) => !v);
      return;
    }
    setDesktopView((v) => (v === 'expanded-comments' ? 'expanded' : 'expanded-comments'));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getConditionBadgeColor = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'like new':
        return 'bg-emerald-50 text-emerald-700';
      case 'good':
        return 'bg-blue-50 text-blue-700';
      case 'fair':
        return 'bg-amber-50 text-amber-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  const isDesktopExpanded = !isMobile && desktopView !== 'compact';

  return (
    <article className="border-b border-[#f0f0f0] px-3 md:px-4 py-3 md:py-4 hover:bg-[#fafafa] transition-colors">
      <div className="flex gap-3 items-start">

        {/* Left: Fixed square thumbnail — always just the cover photo
            (images[0]). On mobile this opens the full-page detail; on
            desktop it expands this card in place. */}
        <button
          type="button"
          onClick={handleOpenPost}
          aria-label={isDesktopExpanded ? `Collapse ${item.title}` : `View details for ${item.title}`}
          className="relative shrink-0 w-[88px] h-[88px] rounded-xl overflow-hidden border border-[#f0f0f0] bg-[#f5f5f5]"
        >
          {item.images[0] ? (
            <ImageWithFallback
              src={item.images[0]}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100">
              <span className="text-2xl font-bold text-[#6366f1]">
                {item.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {item.images.length > 1 && (
            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
              1/{item.images.length}
            </span>
          )}
        </button>

        {/* Right: All details stacked vertically */}
        <div className="flex-1 min-w-0">

          {/* Top row: title + menu */}
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <h3
              onClick={handleOpenPost}
              className="text-[14px] font-semibold text-black leading-snug font-[Roboto] line-clamp-2 cursor-pointer"
            >
              {item.title}
            </h3>
            {(isOwnItem || isAdmin) && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Listing options"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#999] hover:text-black p-1 rounded-full hover:bg-black/5 transition-colors shrink-0 -mt-0.5"
                  >
                    <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isOwnItem && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onEdit?.(item); }}
                    >
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

          {/* Price + condition + category */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[15px] font-bold text-black font-[Roboto]">{formatPrice(item.price)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getConditionBadgeColor(item.condition)}`}>
              {item.condition}
            </span>
            <span className="text-[#bbb] text-[10px]">·</span>
            <span className="text-[#999] text-[11px] font-[Roboto]">{item.category}</span>
          </div>

          {/* Seller + date */}
          <div className={`flex items-center gap-1 ${item.locationName ? 'mb-1' : 'mb-2'}`}>
            <span className="text-[11px] text-[#999] font-[Roboto] truncate">{item.seller.name}</span>
            <span className="text-[#ccc] text-[10px]">·</span>
            <span className="text-[11px] text-[#bbb] shrink-0">{formatDate(item.postedDate)}</span>
          </div>

          {/* Real meetup spot, if the seller set one — tap to see the map
              in the full post (no fabricated location shown otherwise). */}
          {item.locationName && (
            <button
              onClick={handleOpenPost}
              className="flex items-center gap-1 mb-2 text-[#6366f1] hover:text-[#4f46e5] transition-colors"
            >
              <MapPin className="w-3 h-3" strokeWidth={2} />
              <span className="text-[11px] font-medium truncate max-w-[220px]">{item.locationName}</span>
            </button>
          )}

          {/* Stats + action */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[#aaa]">
              <button
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
                className="flex items-center gap-1 hover:text-red-500 transition-colors group"
              >
                <Heart
                  className={`w-3.5 h-3.5 transition-all ${isSaved ? 'fill-red-500 text-red-500' : 'group-hover:scale-110'}`}
                  strokeWidth={1.5}
                />
                {item.savedBy.length > 0 && (
                  <span className="text-[11px]">{item.savedBy.length}</span>
                )}
              </button>
              <div className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[11px]">{item.views}</span>
              </div>
              <div className="flex items-center gap-1" title="People who contacted the seller">
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[11px]">{conversationCount}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleComments(); }}
                className={`flex items-center gap-1 transition-colors ${desktopView === 'expanded-comments' && !isMobile ? 'text-black' : 'hover:text-black'}`}
                title="Comments"
              >
                <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[11px]">{item.comments.length}</span>
              </button>
            </div>

            {!isOwnItem && (
              <Button
                onClick={(e) => { e.stopPropagation(); handleContactSeller(); }}
                className="bg-black hover:bg-black/80 text-white px-3 h-7 rounded-full text-xs font-[Roboto]"
              >
                Contact
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: clicking the post expands it in place — full gallery,
          full body, and (optionally) comments — instead of opening a
          modal, drawer, or separate page. */}
      {isDesktopExpanded && (
        <div className="mt-3 pt-3 border-t border-[#f0f0f0] animate-in fade-in slide-in-from-top-1 duration-200">
          <MarketplacePostGallery images={item.images} title={item.title} />
          <div className="mt-3">
            <MarketplacePostBody item={item} />
          </div>

          <div className="mt-2 flex justify-end">
            <button
              onClick={handleOpenPost}
              className="flex items-center gap-1 text-xs font-medium text-[#666] hover:text-black hover:bg-black/5 rounded-full px-2 py-1 transition-colors"
            >
              Show less
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {desktopView === 'expanded-comments' && (
            <div className="mt-1 pt-3 border-t border-[#f0f0f0]">
              <CommentsPanel
                variant="inline"
                comments={item.comments}
                currentUserId={user?.id}
                currentUserName={undefined}
                isAdmin={isAdmin}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onClose={() => setDesktopView('expanded')}
              />
            </div>
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete this listing?"
        onConfirm={handleDeleteItem}
      />

      {/* Mobile: comments still slide up as a bottom sheet — this is a
          deliberately-kept mobile pattern, unrelated to the post-detail
          bottom sheet that was removed. */}
      {isMobile && (
        <CommentsSheet
          open={isCommentsOpen}
          onOpenChange={setIsCommentsOpen}
          comments={item.comments}
          currentUserId={user?.id}
          currentUserName={undefined}
          isAdmin={isAdmin}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}
    </article>
  );
}
