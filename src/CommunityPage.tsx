import { useState, useMemo } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { PostCard } from './components/PostCard';
import { FloatingActionButton } from './components/FloatingActionButton';
import { CreatePostDialog } from './components/CreatePostDialog';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { ArrowLeft, Search, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { useData } from './utils/dataContext';

const mockPosts = [
  {
    id: '1',
    title: 'Looking for study group partners for CS101',
    date: '2025-10-28',
    author: 'Anonymous Student',
    verified: true,
    content: 'Hey everyone! I\'m looking for a few people to form a study group for CS101. We can meet in the library twice a week. Anyone interested?',
    image: null,
    likes: 24,
    category: 'current-students',
    comments: [
      { id: '1', author: 'Anonymous', text: 'I\'d be interested! What times work for you?', date: '2025-10-28' },
      { id: '2', author: 'Anonymous', text: 'Count me in! Tuesday and Thursday evenings would be great.', date: '2025-10-29' }
    ]
  },
  {
    id: '2',
    title: 'Free pizza at the Student Center today!',
    date: '2025-10-30',
    author: 'Anonymous Student',
    verified: true,
    content: 'The Computer Science club is giving away free pizza slices from 12-2pm at the Student Center. First come, first served!',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
    likes: 156,
    category: 'current-students',
    comments: [
      { id: '1', author: 'Anonymous', text: 'OMG thank you for sharing! 🍕', date: '2025-10-30' },
      { id: '2', author: 'Anonymous', text: 'Are there veggie options?', date: '2025-10-30' },
      { id: '3', author: 'Anonymous', text: 'Yes! Cheese and veggie supreme available', date: '2025-10-30' }
    ]
  },
  {
    id: '3',
    title: 'Lost: Blue backpack near Engineering building',
    date: '2025-10-29',
    author: 'Anonymous Student',
    verified: true,
    content: 'I lost my blue JanSport backpack yesterday near the Engineering building. It has my laptop and textbooks. If anyone finds it, please contact the campus lost & found.',
    image: null,
    likes: 12,
    category: 'current-students',
    comments: [
      { id: '1', author: 'Anonymous', text: 'I saw someone turn in a blue backpack at the library desk this morning!', date: '2025-10-29' }
    ]
  },
  {
    id: '4',
    title: 'Best coffee spots on campus?',
    date: '2025-10-27',
    author: 'Anonymous Student',
    verified: true,
    content: 'New transfer student here! What are the best places to grab coffee between classes? Looking for somewhere with good wifi and not too crowded.',
    image: null,
    likes: 45,
    category: 'current-students',
    comments: [
      { id: '1', author: 'Anonymous', text: 'The café in the Arts building is pretty quiet and has great cold brew!', date: '2025-10-27' },
      { id: '2', author: 'Anonymous', text: 'Commons Café is my favorite - good prices too', date: '2025-10-28' }
    ]
  },
  {
    id: '5',
    title: 'Campus cleanup volunteer opportunity',
    date: '2025-10-26',
    author: 'Anonymous Student',
    verified: true,
    content: 'Join us this Saturday for a campus cleanup event! We\'ll be beautifying the quad and planting some new trees. Free t-shirt and lunch for all volunteers. Sign up link in comments.',
    image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&q=80',
    likes: 89,
    category: 'current-students',
    comments: [
      { id: '1', author: 'Anonymous', text: 'What time does it start?', date: '2025-10-26' },
      { id: '2', author: 'Anonymous', text: '9am - 2pm, but you can join anytime!', date: '2025-10-26' }
    ]
  },
  {
    id: '6',
    title: 'Alumni networking event - Tech industry professionals',
    date: '2025-10-25',
    author: 'Anonymous Alumni',
    verified: true,
    content: 'Calling all alumni working in tech! Let\'s organize a networking mixer next month. Great opportunity to connect, share experiences, and maybe even mentor current students.',
    image: null,
    likes: 67,
    category: 'alumni',
    comments: [
      { id: '1', author: 'Anonymous', text: 'Great idea! Count me in', date: '2025-10-25' },
      { id: '2', author: 'Anonymous', text: 'Can we do it virtually? I\'m in a different state now', date: '2025-10-26' }
    ]
  },
  {
    id: '7',
    title: 'Reuniting after 10 years - Class of 2015',
    date: '2025-10-24',
    author: 'Anonymous Alumni',
    verified: true,
    content: 'Can you believe it\'s been 10 years since we graduated? Looking to organize an informal reunion. Drop a comment if you\'re interested!',
    image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&q=80',
    likes: 134,
    category: 'alumni',
    comments: [
      { id: '1', author: 'Anonymous', text: 'Wow, time flies! I\'m in!', date: '2025-10-24' },
      { id: '2', author: 'Anonymous', text: 'Let\'s do it at our old hangout spot!', date: '2025-10-25' }
    ]
  }
];

export default function CommunityPage() {
  const { posts, addPost } = useData();
  const [selectedTab, setSelectedTab] = useState('all-school');
  const [sortBy, setSortBy] = useState('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);

  const handleCreatePost = async (newPost: {
    title: string;
    category: string;
    content: string;
    image?: string;
  }) => {
    try {
      await addPost({
        title: newPost.title,
        content: newPost.content,
        image: newPost.image || null,
        category: newPost.category as 'current-students' | 'alumni' | 'all-school',
      });
      toast.success('Post created successfully!');
    } catch (err: any) {
      console.error('[handleCreatePost]', err);
      toast.error(err?.message || 'Failed to create post. Please try again.');
    }
  };

  // Filter and search logic
  const filteredAndSortedPosts = useMemo(() => {
    let result = [...posts];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.content.toLowerCase().includes(query)
      );
    }

    // Apply category filter (tabs)
    if (selectedTab !== 'all-school') {
      result = result.filter((post) => {
        const postCategory = (post as any).category || 'current-students';
        return postCategory === selectedTab;
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'latest':
        result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case 'popular':
        result.sort((a, b) => b.likes.length - a.likes.length);
        break;
      case 'most-commented':
        result.sort((a, b) => b.comments.length - a.comments.length);
        break;
    }

    return result;
  }, [posts, searchQuery, selectedTab, sortBy]);

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="community" />
      
      {/* Utility bar — page title now lives in NavigationBar; this row is
          just Post/search controls so it doesn't duplicate that title. */}
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
                    placeholder="Search posts..."
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
              <>
                <Button
                  onClick={() => setIsCreatePostOpen(true)}
                  className="ml-auto bg-black hover:bg-black/80 text-white px-4 h-8 rounded-full text-sm font-[Roboto]"
                >
                  Post
                </Button>
                <button 
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <Search className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <TabsList className="w-full bg-transparent border-0 p-0 h-auto justify-start gap-8">
              <TabsTrigger 
                value="all-school" 
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto]"
              >
                For you
              </TabsTrigger>
              <TabsTrigger 
                value="current-students" 
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto]"
              >
                Following
              </TabsTrigger>
              <TabsTrigger 
                value="alumni" 
                className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto]"
              >
                Alumni
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Posts Feed - Threads Style */}
      <main className="max-w-[640px] mx-auto">
        {filteredAndSortedPosts.length > 0 ? (
          <div>
            {filteredAndSortedPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <p className="text-[#999] text-sm mb-1">No posts yet</p>
            <p className="text-xs text-[#999]">
              {searchQuery
                ? 'Try adjusting your search'
                : 'Be the first to post'}
            </p>
          </div>
        )}
      </main>

      {/* Create Post Dialog */}
      <CreatePostDialog 
        open={isCreatePostOpen}
        onOpenChange={setIsCreatePostOpen}
        onSubmit={handleCreatePost}
      />

      {/* Mobile Floating Action Button */}
      <FloatingActionButton onClick={() => setIsCreatePostOpen(true)} />
    </div>
  );
}