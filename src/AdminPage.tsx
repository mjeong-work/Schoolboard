import { useState, useEffect } from 'react';
import { getAvatarColor, getAnonymousName } from './utils/anonymousName';
import { NavigationBar } from './components/NavigationBar';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { getPendingUsers, approveUser, rejectUser } from './utils/authContext';
import { supabase } from './utils/supabaseClient';
import { toast } from 'sonner@2.0.3';
import {
  Users,
  MessageSquare,
  ShoppingBag,
  CheckCircle,
  XCircle,
  Mail,
  GraduationCap,
  BadgeCheck,
  Clock,
  Trash2,
  Tag,
  DollarSign,
} from 'lucide-react';

interface Stats {
  approved: number;
  pending: number;
  posts: number;
  listings: number;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('approvals');
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({ approved: 0, pending: 0, posts: 0, listings: 0 });
  const [loading, setLoading] = useState(true);
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [allListings, setAllListings] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: 'post' | 'listing' } | null>(null);

  useEffect(() => {
    Promise.all([loadPendingUsers(), loadStats(), loadAllPosts(), loadAllListings()]).finally(() => setLoading(false));
  }, []);

  const loadPendingUsers = async () => {
    const users = await getPendingUsers();
    setPendingUsers(users);
  };

  const loadStats = async () => {
    const [
      { count: approved },
      { count: pending },
      { count: posts },
      { count: listings },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('marketplace_items').select('*', { count: 'exact', head: true }),
    ]);
    setStats({
      approved: approved ?? 0,
      pending: pending ?? 0,
      posts: posts ?? 0,
      listings: listings ?? 0,
    });
  };

  const loadAllPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('id, title, category, created_at, author_id, profiles!posts_author_id_fkey(name)')
      .order('created_at', { ascending: false });
    setAllPosts(data || []);
  };

  const loadAllListings = async () => {
    const { data } = await supabase
      .from('marketplace_items')
      .select('id, title, category, price, created_at, seller_id, profiles!marketplace_items_seller_id_fkey(name)')
      .order('created_at', { ascending: false });
    setAllListings(data || []);
  };

  const handleDeletePost = async (postId: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) { toast.error('Failed to delete post'); return; }
    toast.success('Post deleted');
    setConfirmDelete(null);
    await Promise.all([loadAllPosts(), loadStats()]);
  };

  const handleDeleteListing = async (itemId: string) => {
    const { error } = await supabase.from('marketplace_items').delete().eq('id', itemId);
    if (error) { toast.error('Failed to delete listing'); return; }
    toast.success('Listing deleted');
    setConfirmDelete(null);
    await Promise.all([loadAllListings(), loadStats()]);
  };

  const handleApprove = async (userId: string) => {
    const { error } = await approveUser(userId);
    if (error) { toast.error('Failed to approve user'); return; }
    toast.success('User approved');
    await Promise.all([loadPendingUsers(), loadStats()]);
  };

  const handleReject = async (userId: string) => {
    const { error } = await rejectUser(userId);
    if (error) { toast.error('Failed to reject user'); return; }
    toast.error('User application rejected');
    await Promise.all([loadPendingUsers(), loadStats()]);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statCards = [
    { label: 'Approved Users', value: stats.approved, color: '#6366f1', Icon: Users },
    { label: 'Pending Approvals', value: stats.pending, color: '#d97706', Icon: Clock },
    { label: 'Active Posts', value: stats.posts, color: '#059669', Icon: MessageSquare },
    { label: 'Active Listings', value: stats.listings, color: '#8b5cf6', Icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-white">
      <NavigationBar activeTab="admin" />

      <main className="max-w-[960px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          {/* Hidden on mobile — NavigationBar already shows "Admin" as the page
              title there. Desktop's nav doesn't show a title, so it keeps this
              heading. */}
          <h1 className="hidden md:block text-2xl font-bold font-[Bayon] mb-1">Admin Panel</h1>
          <p className="text-[#666] text-sm font-[Roboto]">Manage users and platform content</p>
        </div>

        {/* Stats */}
        <div className="flex items-stretch gap-2 mb-8">
          {statCards.map(({ label, value, color, Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center justify-center gap-2 flex-1 px-2 py-4 border rounded-2xl bg-white hover:opacity-80 transition-all min-h-[130px]"
              style={{ borderColor: color }}
            >
              <Icon className="w-6 h-6" style={{ color }} />
              <div className="text-center">
                <div className="text-2xl font-semibold text-[#111]">
                  {loading ? '—' : value}
                </div>
                <div className="text-xs text-[#666] mt-1 font-[Roboto]">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-transparent border-0 p-0 h-auto justify-start gap-8 mb-6 border-b border-[#f0f0f0]">
            <TabsTrigger
              value="approvals"
              className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto] gap-2"
            >
              <BadgeCheck className="w-4 h-4" />
              Pending Approvals ({stats.pending})
            </TabsTrigger>
            <TabsTrigger
              value="posts"
              className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto] gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Posts ({stats.posts})
            </TabsTrigger>
            <TabsTrigger
              value="listings"
              className="bg-transparent border-0 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-0 pb-3 data-[state=active]:shadow-none font-[Roboto] gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              Listings ({stats.listings})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            {loading ? (
              <div className="py-12 text-center text-[#999] font-[Roboto] text-sm">Loading…</div>
            ) : pendingUsers.length === 0 ? (
              <div className="p-8 text-center text-[#666]">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-[#059669]" />
                <p className="font-semibold font-[Roboto]">No pending approvals</p>
              </div>
            ) : (
              <div>
                {pendingUsers.map((u) => (
                  <div key={u.id} className="border-b border-[#f0f0f0] p-5 bg-white hover:bg-[#fafafa] transition-colors">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <Avatar className="w-14 h-14 shrink-0">
                        <AvatarFallback className="text-white font-semibold text-lg" style={{ background: getAvatarColor(u.id) }}>
                          {(u.name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[#111] font-[Roboto] mb-1">{u.name}</h3>
                        <div className="flex flex-col gap-1 text-sm text-[#666] mb-3">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-[Roboto] truncate">{u.email}</span>
                          </div>
                          {(u.department || u.graduation_year) && (
                            <div className="flex items-center gap-1.5">
                              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-[Roboto]">
                                {[u.role, u.department, u.graduation_year ? `Class of ${u.graduation_year}` : null]
                                  .filter(Boolean).join(' · ')}
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge className="bg-[#fef3c7] text-[#d97706] border-[#d97706]/20 hover:bg-[#fef3c7] text-xs font-[Roboto]">
                          Applied {formatDate(u.created_at)}
                        </Badge>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 shrink-0 w-[120px]">
                        <Button
                          onClick={() => handleApprove(u.id)}
                          className="bg-black hover:bg-[#047857] text-white gap-2 w-full font-[Roboto]"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleReject(u.id)}
                          className="bg-[rgba(255,10,10,0.08)] border border-[#f0f0f0] text-[#dc2626] hover:bg-[#fef2f2] gap-2 w-full font-[Roboto]"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="posts">
            {loading ? (
              <div className="py-12 text-center text-[#999] font-[Roboto] text-sm">Loading…</div>
            ) : allPosts.length === 0 ? (
              <div className="p-8 text-center text-[#666]">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-[#999]" />
                <p className="font-semibold font-[Roboto]">No posts yet</p>
              </div>
            ) : (
              <div>
                {allPosts.map((p) => (
                  <div key={p.id} className="border-b border-[#f0f0f0] p-4 bg-white hover:bg-[#fafafa] transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#111] font-[Roboto] truncate">{p.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[#666] font-[Roboto]">
                          <span>{p.profiles?.name ?? getAnonymousName(p.author_id || p.id)}</span>
                          <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{p.category}</span>
                          <span>{p.created_at?.split('T')[0]}</span>
                        </div>
                      </div>
                      {confirmDelete?.id === p.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-[#dc2626] font-[Roboto]">Delete?</span>
                          <Button
                            onClick={() => handleDeletePost(p.id)}
                            className="h-7 px-3 text-xs bg-[#dc2626] hover:bg-[#b91c1c] text-white font-[Roboto]"
                          >Confirm</Button>
                          <Button
                            onClick={() => setConfirmDelete(null)}
                            className="h-7 px-3 text-xs bg-transparent border border-[#e5e5e5] text-[#666] hover:bg-[#f5f5f5] font-[Roboto]"
                          >Cancel</Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setConfirmDelete({ id: p.id, type: 'post' })}
                          className="shrink-0 h-8 w-8 p-0 bg-transparent border border-[#f0f0f0] text-[#999] hover:text-[#dc2626] hover:border-[#dc2626] hover:bg-[#fef2f2]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="listings">
            {loading ? (
              <div className="py-12 text-center text-[#999] font-[Roboto] text-sm">Loading…</div>
            ) : allListings.length === 0 ? (
              <div className="p-8 text-center text-[#666]">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-[#999]" />
                <p className="font-semibold font-[Roboto]">No listings yet</p>
              </div>
            ) : (
              <div>
                {allListings.map((item) => (
                  <div key={item.id} className="border-b border-[#f0f0f0] p-4 bg-white hover:bg-[#fafafa] transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#111] font-[Roboto] truncate">{item.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[#666] font-[Roboto]">
                          <span>{item.profiles?.name ?? getAnonymousName(item.seller_id || item.id)}</span>
                          <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{item.category}</span>
                          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{Number(item.price).toFixed(2)}</span>
                          <span>{item.created_at?.split('T')[0]}</span>
                        </div>
                      </div>
                      {confirmDelete?.id === item.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-[#dc2626] font-[Roboto]">Delete?</span>
                          <Button
                            onClick={() => handleDeleteListing(item.id)}
                            className="h-7 px-3 text-xs bg-[#dc2626] hover:bg-[#b91c1c] text-white font-[Roboto]"
                          >Confirm</Button>
                          <Button
                            onClick={() => setConfirmDelete(null)}
                            className="h-7 px-3 text-xs bg-transparent border border-[#e5e5e5] text-[#666] hover:bg-[#f5f5f5] font-[Roboto]"
                          >Cancel</Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setConfirmDelete({ id: item.id, type: 'listing' })}
                          className="shrink-0 h-8 w-8 p-0 bg-transparent border border-[#f0f0f0] text-[#999] hover:text-[#dc2626] hover:border-[#dc2626] hover:bg-[#fef2f2]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
