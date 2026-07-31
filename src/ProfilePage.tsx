import { useState } from 'react';
import { NavigationBar } from './components/NavigationBar';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { useAuth } from './utils/authContext';
import { useData } from './utils/dataContext';
import {
  Mail,
  Calendar,
  BadgeCheck,
  Settings,
  MessageSquare,
  CalendarDays,
  ShoppingBag,
  Heart,
  Eye,
  Search,
  X
} from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const { getUserPosts, getUserEvents, getUserMarketplaceItems, getUserStats, isLoading } = useData();
  const [activeTab, setActiveTab] = useState('posts');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();
  const matches = (title: string) => !query || title.toLowerCase().includes(query);

  const userPosts = getUserPosts().filter(p => matches(p.title));
  const userEvents = getUserEvents().filter(e => matches(e.title));
  const userItems = getUserMarketplaceItems().filter(i => matches(i.title));
  const stats = getUserStats();

  const name = user?.name || 'User';
  const email = user?.email || '';
  const avatar = user?.avatar;
  const verified = user?.verified || false;
  const major = user?.department || '';
  const graduationYear = user?.graduationYear || '';
  const bio = user?.bio || '';
  const joinDate = user?.joinDate || '';

  const formatJoinDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const majorLine = [
    major || 'Major not set',
    graduationYear ? `Class of ${graduationYear}` : null,
  ].filter(Boolean).join(' • ');

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="profile" />

      {/* Threads-style Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
        <div className="max-w-[640px] mx-auto px-4 border-b border-[#f0f0f0]">
          <div className="flex items-center py-3 gap-3">
            <h1 className="text-2xl font-bold font-[Bayon]">Profile</h1>
            {isSearchOpen ? (
              <>
                <div className="w-1/2 flex items-center gap-2 bg-[#f5f5f5] rounded-full px-[16px] py-[8px] ml-auto">
                  <Search className="w-5 h-5 text-[#999]" strokeWidth={1.5} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your activity..."
                    autoFocus
                    className="flex-1 bg-transparent outline-none text-black placeholder:text-[#999] text-sm"
                  />
                </div>
                <button
                  onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-black" strokeWidth={1.5} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="ml-auto p-2 hover:bg-black/5 rounded-full transition-colors"
                aria-label="Search your activity"
              >
                <Search className="w-5 h-5 text-[#666]" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {/* Profile Header Card */}
        <Card className="p-4 sm:p-5 rounded-[0px] mb-5 border-0">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="flex justify-center sm:justify-start text-[rgb(10,10,10)] font-[Roboto]">
              <Avatar className="w-16 h-16 sm:w-24 sm:h-24 border-[3px] border-[#f0f0f0] shadow-lg">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback className="text-xl bg-[#6366f1] text-white">
                  {name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                    <h2 className="text-[#111] font-[Roboto] text-xl font-bold">{name}</h2>
                    {verified && <BadgeCheck className="w-6 h-6 text-[#6366f1]" />}
                  </div>
                  <p className="text-[#666] mb-3 font-[Roboto] text-sm line-clamp-3">
                    {bio ? bio : <span className="italic text-[#bbb]">No bio yet — add one in Edit Profile</span>}
                  </p>
                </div>

                <Button
                  onClick={() => window.location.hash = 'edit-profile'}
                  className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-4 py-2 rounded-lg gap-2 self-center sm:self-start font-[Roboto] text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Edit Profile
                </Button>
              </div>

              {/* User Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-sm">
                {email && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-[#666] font-[Roboto]">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{email}</span>
                  </div>
                )}
                <div className="flex items-center justify-center sm:justify-start gap-2 text-[#666] font-[Roboto]">
                  <BadgeCheck className="w-4 h-4" />
                  <span className="text-sm">{majorLine}</span>
                </div>
                {joinDate && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-[#666] font-[Roboto]">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Joined {formatJoinDate(joinDate)}</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#f0f0f0]">
                <div className="text-center">
                  <div className="text-xl font-bold text-[#111] mb-1 font-[Roboto]">{stats.posts}</div>
                  <div className="text-sm text-[#666] font-[Roboto]">Posts</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#111] mb-1 font-[Roboto]">{stats.eventsAttended}</div>
                  <div className="text-sm text-[#666] font-[Roboto]">Events</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#111] mb-1 font-[Roboto]">{stats.listings}</div>
                  <div className="text-sm text-[#666] font-[Roboto]">Listings</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#111] mb-1 font-[Roboto]">{stats.savedItems}</div>
                  <div className="text-sm text-[#666] font-[Roboto]">Saved</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Activity Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-transparent border-0 p-0 h-auto flex-nowrap justify-start overflow-x-auto gap-4 sm:gap-8 mb-6 border-b border-[#f0f0f0]">
            <TabsTrigger
              value="posts"
              className="shrink-0 whitespace-nowrap bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto] gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              My Posts
            </TabsTrigger>
            <TabsTrigger
              value="events"
              className="shrink-0 whitespace-nowrap bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto] gap-2"
            >
              <CalendarDays className="w-4 h-4" />
              My Events
            </TabsTrigger>
            <TabsTrigger
              value="items"
              className="shrink-0 whitespace-nowrap bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto] gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              My Items
            </TabsTrigger>
          </TabsList>

          {/* My Posts */}
          <TabsContent value="posts" className="space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-[#999] font-[Roboto] text-sm">Loading…</div>
            ) : userPosts.length === 0 ? (
              <Card className="p-8 border border-[#f0f0f0] rounded-xl text-center">
                <MessageSquare className="w-12 h-12 text-[#d1d5db] mx-auto mb-3" />
                {query ? (
                  <p className="text-[#666] font-[Roboto]">No posts match "{searchQuery}".</p>
                ) : (
                  <>
                    <p className="text-[#666] font-[Roboto]">You haven't created any posts yet.</p>
                    <Button
                      onClick={() => window.location.hash = '#/community'}
                      className="bg-[rgb(0,0,0)] hover:bg-[#1a1a1a] text-[rgb(255,254,254)] mt-4 px-4 py-2 rounded-lg font-[Roboto]"
                    >
                      Create Your First Post
                    </Button>
                  </>
                )}
              </Card>
            ) : (
              userPosts.map((post) => (
                <Card key={post.id} className="p-4 sm:p-5 border-[#f0f0f0] rounded-xl hover:bg-[#fafafa] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-[#111] mb-2 font-[Roboto]">{post.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-[#666] font-[Roboto]">
                        <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <div className="flex items-center gap-1">
                          <Heart className="w-4 h-4" />
                          <span>{post.likes.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-4 h-4" />
                          <span>{post.comments.length}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => window.location.hash = '#/community'}
                      className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-3 py-2 rounded-lg text-sm font-[Roboto]"
                    >
                      View
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* My Events */}
          <TabsContent value="events" className="space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-[#999] font-[Roboto] text-sm">Loading…</div>
            ) : userEvents.length === 0 ? (
              <Card className="p-8 border border-[#f0f0f0] rounded-xl text-center">
                <CalendarDays className="w-12 h-12 text-[#d1d5db] mx-auto mb-3" />
                {query ? (
                  <p className="text-[#666] font-[Roboto]">No events match "{searchQuery}".</p>
                ) : (
                  <>
                    <p className="text-[#666] font-[Roboto]">You haven't RSVP'd to any events yet.</p>
                    <Button
                      onClick={() => window.location.hash = '#/events'}
                      className="bg-[rgb(0,0,0)] hover:bg-[#1a1a1a] text-white mt-4 px-4 py-2 rounded-lg font-[Roboto]"
                    >
                      Browse Events
                    </Button>
                  </>
                )}
              </Card>
            ) : (
              userEvents.map((event) => (
                <Card key={event.id} className="p-4 sm:p-5 border-[#f0f0f0] rounded-xl hover:bg-[#fafafa] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-[#111] flex-1 font-[Roboto]">{event.title}</h3>
                        <Badge className="bg-[#eff6ff] text-[#6366f1] border-[#6366f1]/20 hover:bg-[#eff6ff] text-xs px-2 py-1 font-[Roboto]">
                          RSVP'd
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#666] font-[Roboto]">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => window.location.hash = '#/events'}
                      className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafafa] px-3 py-2 rounded-lg text-sm font-[Roboto]"
                    >
                      View
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* My Items */}
          <TabsContent value="items" className="space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-[#999] font-[Roboto] text-sm">Loading…</div>
            ) : userItems.length === 0 ? (
              <Card className="p-8 border border-[#f0f0f0] rounded-xl text-center">
                <ShoppingBag className="w-12 h-12 text-[#d1d5db] mx-auto mb-3" />
                {query ? (
                  <p className="text-[#666] font-[Roboto]">No items match "{searchQuery}".</p>
                ) : (
                  <>
                    <p className="text-[#666] font-[Roboto]">You haven't listed any items for sale yet.</p>
                    <Button
                      onClick={() => window.location.hash = '#/marketplace'}
                      className="bg-[rgb(0,0,0)] hover:bg-[#1a1a1a] text-white mt-4 px-4 py-2 rounded-lg font-[Roboto]"
                    >
                      Create Your First Listing
                    </Button>
                  </>
                )}
              </Card>
            ) : (
              userItems.map((item) => (
                <Card key={item.id} className="p-4 sm:p-5 border-[#f0f0f0] rounded-xl hover:bg-[#fafafa] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-[#111] flex-1 font-[Roboto]">{item.title}</h3>
                        <div className="text-[#6366f1] font-[Roboto]">${item.price}</div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[#666] font-[Roboto]">
                        <Badge className="bg-[#ecfdf5] text-[#059669] border-[#059669]/20 hover:bg-[#ecfdf5] text-xs px-2 py-1 font-[Roboto]">
                          Active
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{item.views} views</span>
                        </div>
                        {item.savedBy.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Heart className="w-4 h-4" />
                            <span>{item.savedBy.length} saved</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => window.location.hash = '#/marketplace'}
                      className="bg-white border border-[#f0f0f0] text-[#111] hover:bg-[#fafaba] px-3 py-2 rounded-lg text-sm font-[Roboto]"
                    >
                      View
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
