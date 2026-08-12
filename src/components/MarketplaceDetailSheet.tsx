import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, MoreHorizontal, Send } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from './ui/drawer';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from './ui/carousel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { getAvatarColor } from '../utils/anonymousName';
import { useData, type MarketplaceItem } from '../utils/dataContext';
import { useAuth } from '../utils/authContext';
import { toast } from 'sonner@2.0.3';

interface MarketplaceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MarketplaceItem;
}

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

// Detail view: full photo gallery (thumbnail only ever shows the cover
// photo — images[0]) + full description + comments, all in one sheet.
// Opening this sheet is what counts as a genuine "view" of the listing —
// see incrementItemViews below, replacing the old mount-based counter that
// used to fire for every card merely rendered in the feed.
export function MarketplaceDetailSheet({ open, onOpenChange, item }: MarketplaceDetailSheetProps) {
  const { user } = useAuth();
  const { incrementItemViews, addCommentToMarketplaceItem, deleteCommentFromMarketplaceItem } = useData();
  const isAdmin = user?.role === 'Administrator';

  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrentSlide(carouselApi.selectedScrollSnap());
    onSelect();
    carouselApi.on('select', onSelect);
    return () => { carouselApi.off('select', onSelect); };
  }, [carouselApi]);

  // Reset to the first photo each time a (possibly different) item's sheet opens.
  useEffect(() => {
    if (open) {
      carouselApi?.scrollTo(0);
      setCurrentSlide(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);

  useEffect(() => {
    if (!open) return;
    // Same session-scoped dedupe as before — only count one view per item
    // per browser session, just moved from "card mounted" to "detail opened".
    const hasViewed = sessionStorage.getItem(`viewed_item_${item.id}`);
    if (!hasViewed) {
      incrementItemViews(item.id);
      sessionStorage.setItem(`viewed_item_${item.id}`, 'true');
    }
  }, [open, item.id, incrementItemViews]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addCommentToMarketplaceItem(item.id, commentText.trim());
      setCommentText('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteCommentFromMarketplaceItem(item.id, commentId);
      toast.success('Comment deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete comment');
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] font-[Roboto]">
        <DrawerTitle className="sr-only">{item.title}</DrawerTitle>
        <DrawerDescription className="sr-only">Listing details and comments</DrawerDescription>

        <div className="flex-1 overflow-y-auto">
          {/* Photo gallery — swipeable through every image, unlike the
              card thumbnail which only ever shows the cover photo. */}
          {item.images.length > 0 ? (
            <div className="relative w-full h-56 sm:h-64 bg-[#f5f5f5]">
              <Carousel setApi={setCarouselApi} className="w-full h-full">
                <CarouselContent className="-ml-0 h-56 sm:h-64">
                  {item.images.map((img, index) => (
                    <CarouselItem key={index} className="pl-0 h-56 sm:h-64">
                      <ImageWithFallback
                        src={img}
                        alt={`${item.title} — photo ${index + 1} of ${item.images.length}`}
                        className="w-full h-full object-cover"
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              {item.images.length > 1 && (
                <>
                  <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded-full pointer-events-none">
                    {currentSlide + 1} / {item.images.length}
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
                    {item.images.map((_, index) => (
                      <span
                        key={index}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          index === currentSlide ? 'bg-white' : 'bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="w-full h-40 flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100">
              <span className="text-4xl font-bold text-[#6366f1]">
                {item.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="px-4 py-4">
            {/* Title + price */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="text-lg font-semibold text-black font-[Roboto]">{item.title}</h2>
              <span className="text-lg font-bold text-black font-[Roboto] shrink-0">${item.price}</span>
            </div>

            {/* Condition + category */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs text-[#666]">
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100">{item.condition}</span>
              <span className="text-[#bbb]">·</span>
              <span>{item.category}</span>
            </div>

            {/* Seller */}
            <div className="flex items-center gap-1 mb-4 text-sm text-[#666]">
              <span>{item.seller.name}</span>
              {item.seller.verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />}
            </div>

            {/* Full description */}
            <p className="text-sm text-[#111] leading-relaxed whitespace-pre-wrap mb-6">
              {item.description}
            </p>

            {/* Comments */}
            <div className="border-t border-[#f0f0f0] pt-4">
              <h3 className="text-sm font-semibold text-[#111] mb-3">
                Comments {item.comments.length > 0 && `(${item.comments.length})`}
              </h3>

              {item.comments.length === 0 ? (
                <p className="text-sm text-[#999] py-4 text-center">No comments yet. Be the first to reply.</p>
              ) : (
                <div className="space-y-4 mb-4">
                  {item.comments.map((comment) => {
                    const isOwnComment = user?.id === comment.authorId;
                    return (
                      <div key={comment.id} className="flex gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                          style={{ background: getAvatarColor(comment.authorId) }}
                        >
                          {comment.author.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="bg-[#f5f5f5] rounded-2xl px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-[#111]">{comment.author}</span>
                              {(isOwnComment || isAdmin) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="p-1 -mr-1 -mt-0.5 hover:bg-black/5 rounded-full transition-colors shrink-0">
                                      <MoreHorizontal className="w-3.5 h-3.5 text-[#999]" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onClick={() => handleDeleteComment(comment.id)}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                            <p className="text-sm text-[#111] leading-relaxed">{comment.text}</p>
                          </div>
                          <span className="text-xs text-[#999] mt-1 ml-3 block">
                            {formatCommentDate(comment.date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed composer */}
        <div className="border-t border-[#f0f0f0] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
              style={{ background: getAvatarColor(user?.id || '') }}
            >
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 flex items-center gap-1 bg-[#f5f5f5] rounded-full pl-4 pr-1.5 h-10">
              <input
                ref={inputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                placeholder="Leave your thoughts here..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#999] min-w-0"
              />
            </div>
            <Button
              onClick={handleSubmitComment}
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
