import { Search, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { MarketplaceCard } from './components/MarketplaceCard';
import { FloatingActionButton } from './components/FloatingActionButton';
import { CreateMarketplaceDialog } from './components/CreateMarketplaceDialog';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { toast } from 'sonner@2.0.3';
import { useData } from './utils/dataContext';
import { useAuth } from './utils/authContext';

export default function MarketplacePage() {
  const { user } = useAuth();
  const { marketplaceItems, addMarketplaceItem } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'latest' | 'nearest'>('latest');

  // Deterministic mock coords per item for geo sort
  const mockDist = (id: string) => {
    const seed = parseInt(id, 10) || id.charCodeAt(0);
    const dlat = ((seed * 7) % 20 - 10) * 0.001;
    const dlng = ((seed * 13) % 20 - 10) * 0.001;
    return Math.sqrt(dlat * dlat + dlng * dlng);
  };

  const handleCreateListing = async (newListing: {
    title: string;
    category: string;
    price: number;
    condition: string;
    description: string;
    image?: string;
  }) => {
    try {
      await addMarketplaceItem({
        title: newListing.title,
        category: newListing.category,
        price: newListing.price,
        condition: newListing.condition,
        description: newListing.description,
        image: newListing.image || null,
        seller: {
          name: user?.name || 'Anonymous Student',
          contact: '',
          verified: user?.verified || false,
        },
      });
      toast.success('Listing created successfully!');
    } catch (err: any) {
      console.error('[handleCreateListing]', err);
      toast.error(err?.message || 'Failed to create listing. Please try again.');
    }
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

    // Apply tab filter
    if (selectedTab === 'interested') {
      // Show only saved/hearted items
      result = result.filter((item) => item.savedBy.includes(user?.id || ''));
    }

    // Sort
    if (sortBy === 'nearest') {
      result.sort((a, b) => mockDist(a.id) - mockDist(b.id));
    } else {
      result.sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime());
    }

    return result;
  }, [marketplaceItems, searchQuery, selectedTab, sortBy, user?.id]);

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
              <div className="flex items-center gap-1 ml-auto">
                {/* Sort toggle */}
                <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5 gap-0.5">
                  {(['latest', 'nearest'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setSortBy(v)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        sortBy === v ? 'bg-white text-black shadow-sm' : 'text-[#666] hover:text-black'
                      }`}
                    >
                      {v === 'latest' ? 'Latest' : 'Nearest'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <Search className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
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
        {filteredItems.length > 0 ? (
          <div>
            {filteredItems.map((item) => (
              <MarketplaceCard key={item.id} item={item} />
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

      {/* Create Listing Dialog */}
      <CreateMarketplaceDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateListing}
      />

      {/* Mobile Floating Action Button */}
      <FloatingActionButton onClick={() => setIsCreateDialogOpen(true)} />
    </div>
  );
}