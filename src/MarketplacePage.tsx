import { Search, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { MarketplaceCard } from './components/MarketplaceCard';
import { MarketplacePostDetailPage } from './components/MarketplacePostDetailPage';
import { FloatingActionButton } from './components/FloatingActionButton';
import { CreateMarketplaceDialog } from './components/CreateMarketplaceDialog';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { toast } from 'sonner@2.0.3';
import { useData, type MarketplaceItem } from './utils/dataContext';
import { useAuth } from './utils/authContext';
import { MARKETPLACE_CATEGORIES } from './utils/marketplaceCategories';

export default function MarketplacePage() {
  const { user } = useAuth();
  const { marketplaceItems, isLoading, loadError, retryLoad, addMarketplaceItem, updateMarketplaceItem } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MarketplaceItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  // Mobile only — which post (if any) is showing as a full-page detail
  // view over the feed. The feed stays mounted underneath, so closing
  // this just reveals it again at whatever scroll position it was at.
  const [mobileDetailItemId, setMobileDetailItemId] = useState<string | null>(null);

  const isDialogOpen = isCreateDialogOpen || !!editingItem;

  const closeListingDialog = (open: boolean) => {
    if (!open) {
      setIsCreateDialogOpen(false);
      setEditingItem(null);
    }
  };

  // Not wrapped in try/catch here on purpose — CreateMarketplaceDialog
  // awaits this and needs the rejection to reach it so it can keep the
  // dialog open (with the user's input intact) instead of closing
  // immediately regardless of whether the save actually succeeded.
  const handleCreateListing = async (newListing: {
    title: string;
    category: string;
    price: number;
    condition: string;
    description: string;
    images: string[];
    locationName?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    googlePlaceId?: string;
  }) => {
    await addMarketplaceItem({
      title: newListing.title,
      category: newListing.category,
      price: newListing.price,
      condition: newListing.condition,
      description: newListing.description,
      images: newListing.images,
      locationName: newListing.locationName,
      locationAddress: newListing.locationAddress,
      locationLat: newListing.locationLat,
      locationLng: newListing.locationLng,
      googlePlaceId: newListing.googlePlaceId,
      seller: {
        name: 'Anonymous Seller',
        contact: '',
        verified: false,
      },
    });
    toast.success('Listing created successfully!');
  };

  const handleEditListing = async (itemId: string, updates: {
    title: string;
    category: string;
    price: number;
    condition: string;
    description: string;
    images: string[];
    locationName?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    googlePlaceId?: string;
  }) => {
    await updateMarketplaceItem(itemId, updates);
    toast.success('Listing updated!');
  };

  // Filter and search logic
  const filteredItems = useMemo(() => {
    let result = [...marketplaceItems];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter((item) => item.category === selectedCategory);
    }

    // Apply tab filter
    if (selectedTab === 'interested') {
      // Show only saved/hearted items
      result = result.filter((item) => item.savedBy.includes(user?.id || ''));
    }

    result.sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime());

    return result;
  }, [marketplaceItems, searchQuery, selectedCategory, selectedTab, user?.id]);

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="marketplace" />

      {/* Utility bar — page title now lives in NavigationBar; this row is
          just search controls so it doesn't duplicate that title. */}
      <div className="sticky top-14 bg-white/95 backdrop-blur-sm z-10">
        <div className="max-w-[640px] mx-auto px-4 border-b border-[#f0f0f0]">
          {/* Top Bar */}
          <div className="flex items-center py-3 gap-3">
            {isSearchOpen ? (
              <>
                <div className="w-1/2 flex items-center gap-2 bg-[#f5f5f5] rounded-full px-[16px] py-[8px] ml-auto">
                  <Search className="w-5 h-5 text-[#999]" strokeWidth={1.5} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search items..."
                    autoFocus
                    className="flex-1 bg-transparent outline-none text-black placeholder:text-[#999] text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                  }}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                {/* Category filter dropdown */}
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="appearance-none bg-[#f5f5f5] rounded-full pl-3 pr-7 py-2 text-sm text-black outline-none cursor-pointer hover:bg-[#ebebeb] transition-colors"
                  >
                    <option value="all">All Categories</option>
                    {MARKETPLACE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#999]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <Search className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
                {/* Hidden on mobile — the floating "+" button already covers
                    listing creation there, so this avoided showing two create
                    controls on the same screen. */}
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="hidden sm:inline-flex bg-black text-white hover:bg-black/90 rounded-full px-4 py-1.5 h-auto text-sm font-[Roboto]"
                >
                  Post
                </Button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <TabsList className="w-full bg-transparent border-0 p-0 h-auto justify-start gap-8">
              <TabsTrigger
                value="all"
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none"
              >
                All Items
              </TabsTrigger>
              <TabsTrigger
                value="interested"
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none"
              >
                Interested
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Items Feed - Threads Style */}
      <main className="max-w-[640px] mx-auto">
        {isLoading ? (
          <div className="text-center py-16 px-4">
            <p className="text-[#999] text-sm">Loading listings…</p>
          </div>
        ) : loadError && marketplaceItems.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-[#999] text-sm mb-3">Couldn't load listings.</p>
            <Button
              onClick={() => retryLoad()}
              className="bg-black text-white hover:bg-black/90 rounded-full px-4 h-8 text-sm font-[Roboto]"
            >
              Try again
            </Button>
          </div>
        ) : filteredItems.length > 0 ? (
          <div>
            {filteredItems.map((item) => (
              <MarketplaceCard
                key={item.id}
                item={item}
                onOpenDetail={setMobileDetailItemId}
                onEdit={setEditingItem}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <p className="text-[#999] text-sm mb-1">No items found</p>
            <p className="text-xs text-[#999]">
              {searchQuery || selectedTab !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Be the first to list an item!'}
            </p>
          </div>
        )}
      </main>

      {/* Create / Edit Listing Dialog — one dialog instance shared by both,
          switching to edit mode whenever editingItem is set. */}
      <CreateMarketplaceDialog
        open={isDialogOpen}
        onOpenChange={closeListingDialog}
        onSubmit={handleCreateListing}
        editItem={editingItem}
        onSubmitEdit={handleEditListing}
      />

      {/* Mobile Floating Action Button */}
      <FloatingActionButton onClick={() => setIsCreateDialogOpen(true)} />

      {/* Mobile full-page post detail — looked up from the unfiltered list
          so it stays open even if a search/filter change would otherwise
          hide it from the feed. */}
      {mobileDetailItemId && (() => {
        const detailItem = marketplaceItems.find((i) => i.id === mobileDetailItemId);
        return detailItem ? (
          <MarketplacePostDetailPage item={detailItem} onBack={() => setMobileDetailItemId(null)} onEdit={setEditingItem} />
        ) : null;
      })()}
    </div>
  );
}
