import { useState, useEffect } from 'react';
import { Heart, Eye, BadgeCheck, MessageCircle, Trash2, MoreHorizontal, MapPin, Navigation, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useData, type MarketplaceItem } from '../utils/dataContext';
import { useAuth } from '../utils/authContext';
import { useChat } from '../utils/chatContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner@2.0.3';

interface MarketplaceCardProps {
  item: MarketplaceItem;
}

export function MarketplaceCard({ item }: MarketplaceCardProps) {
  const { user } = useAuth();
  const { toggleSaveItem, incrementItemViews, deleteMarketplaceItem, isItemSaved } = useData();
  const { getOrCreateConversation } = useChat();

  const [showMap, setShowMap] = useState(false);
  const isSaved = isItemSaved(item.id);
  const isOwnItem = user?.id === item.seller.id;
  const isAdmin = user?.role === 'Administrator';

  // Mock trade locations — cycled by item id hash
  const TRADE_SPOTS = [
    { name: 'Student Union Building', address: '123 Campus Drive, University Park, PA 16802' },
    { name: 'Main Library Entrance', address: '220 Library Lane, University Park, PA 16802' },
    { name: 'Recreation Center Lobby', address: '1 Recreation Way, University Park, PA 16802' },
    { name: 'Engineering Hall Atrium', address: '112 Engineering Ave, University Park, PA 16802' },
    { name: 'Business School Lobby', address: '303 Commerce St, University Park, PA 16802' },
    { name: 'Campus Coffee House', address: '45 Campus Blvd, University Park, PA 16802' },
  ];
  const tradeSpot = TRADE_SPOTS[parseInt(item.id, 10) % TRADE_SPOTS.length] ?? TRADE_SPOTS[0];

  // Increment views when component mounts (simulate viewing)
  useEffect(() => {
    const hasViewed = sessionStorage.getItem(`viewed_item_${item.id}`);
    if (!hasViewed) {
      incrementItemViews(item.id);
      sessionStorage.setItem(`viewed_item_${item.id}`, 'true');
    }
  }, [item.id, incrementItemViews]);

  const handleSave = async () => {
    try {
      await toggleSaveItem(item.id);
      toast.success(isSaved ? 'Item unsaved' : 'Item saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update save');
    }
  };

  const handleContactSeller = async () => {
    if (!user || isOwnItem) return;
    try {
      const conversationId = await getOrCreateConversation(
        item.seller.id,
        item.seller.name,
        { type: 'marketplace', itemId: item.id, itemTitle: item.title }
      );
      if (!conversationId) {
        toast.error('Could not start conversation. Please try again.');
        return;
      }
      window.dispatchEvent(new CustomEvent('openChat', { detail: { conversationId } }));
    } catch (err: any) {
      console.error('[handleContactSeller]', err);
      toast.error(err?.message || 'Failed to start conversation. Please try again.');
    }
  };

  const handleDeleteItem = async () => {
    try {
      await deleteMarketplaceItem(item.id);
      toast.success('Item deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete item');
    }
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

  return (
    <article className="border-b border-[#f0f0f0] px-3 md:px-4 py-3 md:py-4 hover:bg-[#fafafa] transition-colors">
      <div className="flex gap-3 items-start">

        {/* Left: Fixed square thumbnail */}
        <div className="shrink-0 w-[88px] h-[88px] rounded-xl overflow-hidden border border-[#f0f0f0] bg-[#f5f5f5]">
          {item.image ? (
            <ImageWithFallback
              src={item.image}
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
        </div>

        {/* Right: All details stacked vertically */}
        <div className="flex-1 min-w-0">

          {/* Top row: title + menu */}
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <h3 className="text-[14px] font-semibold text-black leading-snug font-[Roboto] line-clamp-2">
              {item.title}
            </h3>
            {(isOwnItem || isAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-[#999] hover:text-black p-1 rounded-full hover:bg-black/5 transition-colors shrink-0 -mt-0.5">
                    <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:text-red-600"
                    onClick={handleDeleteItem}
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
            <span className="text-[15px] font-bold text-black font-[Roboto]">${item.price}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getConditionBadgeColor(item.condition)}`}>
              {item.condition}
            </span>
            <span className="text-[#bbb] text-[10px]">·</span>
            <span className="text-[#999] text-[11px] font-[Roboto]">{item.category}</span>
          </div>

          {/* Seller + date */}
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[11px] text-[#999] font-[Roboto] truncate">{item.seller.name}</span>
            {item.seller.verified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
            <span className="text-[#ccc] text-[10px]">·</span>
            <span className="text-[11px] text-[#bbb] shrink-0">{formatDate(item.postedDate)}</span>
          </div>

          {/* Trade location toggle */}
          <button
            onClick={() => setShowMap(v => !v)}
            className="flex items-center gap-1 mb-2 text-[#6366f1] hover:text-[#4f46e5] transition-colors"
          >
            <MapPin className="w-3 h-3" strokeWidth={2} />
            <span className="text-[11px] font-medium truncate max-w-[180px]">{tradeSpot.name}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showMap ? 'rotate-180' : ''}`} strokeWidth={2} />
          </button>

          {/* Expandable map preview */}
          {showMap && (
            <div className="mb-2 rounded-xl overflow-hidden border border-[#e5e7eb] shadow-sm">
              <div
                className="relative w-full h-[110px] bg-[#eef0f3]"
                style={{
                  backgroundImage: `
                    repeating-linear-gradient(0deg, transparent, transparent 29px, #dde0e6 30px),
                    repeating-linear-gradient(90deg, transparent, transparent 59px, #dde0e6 60px)
                  `,
                }}
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-0 right-0 h-[3px] bg-white opacity-80" />
                  <div className="absolute left-1/3 top-0 bottom-0 w-[3px] bg-white opacity-80" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-[2px] bg-white opacity-50" />
                  <div className="absolute top-1/4 left-0 right-0 h-[2px] bg-white opacity-40" />
                </div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-[#6366f1] flex items-center justify-center shadow-lg border-2 border-white">
                    <MapPin className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1] mt-[-1px]" />
                </div>
              </div>
              <div className="px-3 py-1.5 bg-white flex items-center gap-2">
                <Navigation className="w-3 h-3 text-[#6366f1] shrink-0" />
                <p className="text-[11px] text-[#555] truncate">{tradeSpot.address}</p>
              </div>
            </div>
          )}

          {/* Stats + action */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[#aaa]">
              <button
                onClick={handleSave}
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
                <span className="text-[11px]">{Math.max(1, Math.floor(item.views * 0.08 + item.savedBy.length * 1.5))}</span>
              </div>
            </div>

            {!isOwnItem && (
              <Button
                onClick={handleContactSeller}
                className="bg-black hover:bg-black/80 text-white px-3 h-7 rounded-full text-xs font-[Roboto]"
              >
                Contact
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
