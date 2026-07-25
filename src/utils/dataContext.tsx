import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './authContext';
import { supabase } from './supabaseClient';
import { getAnonymousName } from './anonymousName';

export interface Comment {
  id: string;
  author: string;
  authorId: string;
  text: string;
  date: string;
}

export interface Post {
  id: string;
  title: string;
  date: string;
  author: string;
  authorId: string;
  verified: boolean;
  content: string;
  image: string | null;
  likes: string[];
  comments: Comment[];
  category: 'current-students' | 'alumni' | 'all-school';
}

export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  participants: string[];
  description: string;
  image: string;
  likes: string[];
  comments: Comment[];
  author: string;
  authorId: string;
  category?: string;
  // Google Maps location fields (optional; absent on events created before map integration)
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  googlePlaceId?: string;
  locationRadiusMeters?: number;
}

export interface MarketplaceItem {
  id: string;
  title: string;
  category: string;
  price: number;
  condition: string;
  description: string;
  image: string;
  seller: {
    name: string;
    contact: string;
    verified: boolean;
    id: string;
  };
  postedDate: string;
  views: number;
  savedBy: string[];
}

interface DataContextType {
  posts: Post[];
  events: Event[];
  marketplaceItems: MarketplaceItem[];
  addPost: (post: Omit<Post, 'id' | 'date' | 'likes' | 'comments' | 'authorId' | 'author' | 'verified'>) => Promise<void>;
  updatePost: (postId: string, updates: { title?: string; content?: string; image?: string | null; category?: string }) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  toggleLikePost: (postId: string) => Promise<void>;
  addCommentToPost: (postId: string, text: string) => Promise<void>;
  deleteCommentFromPost: (postId: string, commentId: string) => Promise<void>;
  isPostLiked: (postId: string) => boolean;
  addEvent: (event: Omit<Event, 'id' | 'likes' | 'comments' | 'participants' | 'authorId' | 'author'>) => Promise<void>;
  updateEvent: (eventId: string, updates: Partial<Omit<Event, 'id' | 'likes' | 'comments' | 'participants' | 'authorId' | 'author'>>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  toggleLikeEvent: (eventId: string) => Promise<void>;
  addCommentToEvent: (eventId: string, text: string) => Promise<void>;
  toggleRSVPEvent: (eventId: string) => Promise<void>;
  isEventLiked: (eventId: string) => boolean;
  hasRSVPed: (eventId: string) => boolean;
  addMarketplaceItem: (item: Omit<MarketplaceItem, 'id' | 'postedDate' | 'views' | 'savedBy' | 'seller'> & { seller: Omit<MarketplaceItem['seller'], 'id'> }) => Promise<void>;
  deleteMarketplaceItem: (itemId: string) => Promise<void>;
  toggleSaveItem: (itemId: string) => Promise<void>;
  incrementItemViews: (itemId: string) => Promise<void>;
  isItemSaved: (itemId: string) => boolean;
  getUserPosts: () => Post[];
  getUserEvents: () => Event[];
  getUserMarketplaceItems: () => MarketplaceItem[];
  getUserSavedItems: () => MarketplaceItem[];
  getUserStats: () => { posts: number; eventsAttended: number; itemsSold: number; savedItems: number };
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);

  // Fetch posts from Supabase
  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles!posts_author_id_fkey (name, verified),
        post_likes (user_id),
        post_comments (id, text, created_at, profiles!post_comments_author_id_fkey (name, id))
      `)
      .order('created_at', { ascending: false });

    console.log('Posts data:', data);
    console.log('Posts error:', error);

    if (error) { console.error(error); return; }

    const formatted: Post[] = (data || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      image: p.image_url,
      category: p.category,
      author: p.profiles?.name || getAnonymousName(p.author_id || p.id),
      authorId: p.author_id,
      verified: p.profiles?.verified || false,
      date: p.created_at?.split('T')[0],
      likes: (p.post_likes || []).map((l: any) => l.user_id),
      comments: (p.post_comments || []).map((c: any) => ({
        id: c.id,
        text: c.text,
        author: c.profiles?.name || getAnonymousName(c.profiles?.id || c.user_id || c.id),
        authorId: c.profiles?.id || '',
        date: c.created_at?.split('T')[0],
      })),
    }));

    setPosts(formatted);
  };

  // Fetch marketplace items from Supabase
  const fetchMarketplaceItems = async () => {
    const { data, error } = await supabase
      .from('marketplace_items')
      .select(`
        *,
        profiles!marketplace_items_seller_id_fkey (name, verified),
        marketplace_saves (user_id)
      `)
      .order('created_at', { ascending: false });

    if (error) { console.error('[fetchMarketplaceItems]', error); return; }

    const formatted: MarketplaceItem[] = (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      price: Number(item.price),
      condition: item.condition,
      description: item.description,
      image: item.image_url || '',
      seller: {
        name: item.profiles?.name || getAnonymousName(item.seller_id),
        contact: item.contact,
        verified: item.profiles?.verified || false,
        id: item.seller_id,
      },
      postedDate: item.created_at?.split('T')[0],
      views: item.views,
      savedBy: (item.marketplace_saves || []).map((s: any) => s.user_id),
    }));

    setMarketplaceItems(formatted);
  };

  useEffect(() => {
    if (user) {
      fetchPosts();
      fetchEvents();
      fetchMarketplaceItems();
    }
  }, [user]);

  // Posts
  const addPost = async (postData: Omit<Post, 'id' | 'date' | 'likes' | 'comments' | 'authorId' | 'author' | 'verified'>) => {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('posts').insert({
      title: postData.title,
      content: postData.content,
      image_url: postData.image,
      category: postData.category,
      author_id: user.id,
    });
    if (error) {
      console.error('[addPost] Supabase error:', error);
      throw new Error(error.message);
    }
    await fetchPosts();
  };

  const updatePost = async (postId: string, updates: { title?: string; content?: string; image?: string | null; category?: string }) => {
    if (!user) throw new Error('Not authenticated');

    // 1. Read current record for history snapshot
    const { data: current, error: fetchError } = await supabase
      .from('posts')
      .select('title, content, image_url, category')
      .eq('id', postId)
      .single();
    if (fetchError || !current) {
      console.error('[updatePost] Could not read current post for history:', fetchError);
      throw new Error('Could not read current post before editing.');
    }

    // 2. Insert pre-edit snapshot into history
    const { error: historyError } = await supabase.from('post_history').insert({
      post_id: postId,
      edited_by: user.id,
      prev_title: current.title,
      prev_content: current.content,
      prev_image_url: current.image_url,
      prev_category: current.category,
    });
    if (historyError) console.error('[updatePost] history insert error:', historyError);

    // 3. Apply the update
    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.content !== undefined) dbUpdates.content = updates.content;
    if (updates.image !== undefined) dbUpdates.image_url = updates.image;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    const { data, error } = await supabase.from('posts').update(dbUpdates).eq('id', postId).select('id');
    if (error) {
      console.error('[updatePost] Supabase error:', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      console.warn('[updatePost] No rows updated — RLS may be blocking this write for postId:', postId);
      throw new Error('Update was rejected — you may not have permission to edit this post.');
    }
    await fetchPosts();
  };

  const deletePost = async (postId: string) => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
    if (error) {
      console.error('[deletePost] Supabase error:', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      console.warn('[deletePost] No rows deleted — RLS may be blocking this write for postId:', postId);
      throw new Error('Delete was rejected — you may not have permission to delete this post.');
    }
    await fetchPosts();
  };

  const toggleLikePost = async (postId: string) => {
    if (!user) return;
    const liked = isPostLiked(postId);
    const { error } = liked
      ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
    if (error) console.error('[toggleLikePost] Supabase error:', error);
    await fetchPosts();
  };

  const addCommentToPost = async (postId: string, text: string) => {
    if (!user || !text.trim()) return;
    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      author_id: user.id,
      text: text.trim(),
    });
    if (error) {
      console.error('[addCommentToPost] Supabase error:', error);
      throw new Error(error.message);
    }
    await fetchPosts();
  };

  const deleteCommentFromPost = async (postId: string, commentId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .select('id');
    if (error) {
      console.error('[deleteCommentFromPost] Supabase error:', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      console.warn('[deleteCommentFromPost] No rows deleted — RLS may be blocking for commentId:', commentId);
      throw new Error('Delete was rejected — you may not have permission to delete this comment.');
    }
    await fetchPosts();
  };

  const isPostLiked = (postId: string): boolean => {
    if (!user) return false;
    const post = posts.find(p => p.id === postId);
    return post ? post.likes.includes(user.id) : false;
  };

  // Fetch events from Supabase
  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        profiles!events_author_id_fkey (name),
        event_rsvps (user_id),
        event_likes (user_id),
        event_comments (id, text, created_at, profiles!event_comments_author_id_fkey (name, id))
      `)
      .order('date', { ascending: true });

    if (error) { console.error('[fetchEvents]', error); return; }

    const formatted: Event[] = (data || []).map((e: any) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      venue: e.venue,
      description: e.description,
      image: e.image_url || '',
      category: e.category,
      locationName: e.location_name ?? undefined,
      locationAddress: e.location_address ?? undefined,
      locationLat: e.location_lat ?? undefined,
      locationLng: e.location_lng ?? undefined,
      googlePlaceId: e.google_place_id ?? undefined,
      locationRadiusMeters: e.location_radius_meters ?? 300,
      author: e.profiles?.name || getAnonymousName(e.author_id || e.id),
      authorId: e.author_id,
      participants: (e.event_rsvps || []).map((r: any) => r.user_id),
      likes: (e.event_likes || []).map((l: any) => l.user_id),
      comments: (e.event_comments || []).map((c: any) => ({
        id: c.id,
        text: c.text,
        author: c.profiles?.name || getAnonymousName(c.profiles?.id || c.user_id || c.id),
        authorId: c.profiles?.id || '',
        date: c.created_at?.split('T')[0],
      })),
    }));

    setEvents(formatted);
  };

  // Events — Supabase-backed
  const addEvent = async (eventData: Omit<Event, 'id' | 'likes' | 'comments' | 'participants' | 'authorId' | 'author'>) => {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('events').insert({
      title: eventData.title,
      date: eventData.date,
      time: eventData.time,
      venue: eventData.venue,
      description: eventData.description,
      image_url: eventData.image || null,
      category: eventData.category ?? null,
      location_name: eventData.locationName ?? null,
      location_address: eventData.locationAddress ?? null,
      location_lat: eventData.locationLat ?? null,
      location_lng: eventData.locationLng ?? null,
      google_place_id: eventData.googlePlaceId ?? null,
      ...(eventData.locationRadiusMeters !== undefined && {
        location_radius_meters: eventData.locationRadiusMeters,
      }),
      author_id: user.id,
    });
    if (error) { console.error('[addEvent]', error); throw new Error(error.message); }
    await fetchEvents();
  };

  const updateEvent = async (
    eventId: string,
    updates: Partial<Omit<Event, 'id' | 'likes' | 'comments' | 'participants' | 'authorId' | 'author'>>
  ) => {
    if (!user) throw new Error('Not authenticated');
    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.venue !== undefined) dbUpdates.venue = updates.venue;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.image !== undefined) dbUpdates.image_url = updates.image || null;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if ('locationName' in updates) dbUpdates.location_name = updates.locationName ?? null;
    if ('locationAddress' in updates) dbUpdates.location_address = updates.locationAddress ?? null;
    if ('locationLat' in updates) dbUpdates.location_lat = updates.locationLat ?? null;
    if ('locationLng' in updates) dbUpdates.location_lng = updates.locationLng ?? null;
    if ('googlePlaceId' in updates) dbUpdates.google_place_id = updates.googlePlaceId ?? null;
    if (updates.locationRadiusMeters !== undefined)
      dbUpdates.location_radius_meters = updates.locationRadiusMeters;

    const { error } = await supabase.from('events').update(dbUpdates).eq('id', eventId);
    if (error) { console.error('[updateEvent]', error); throw new Error(error.message); }
    await fetchEvents();
  };

  const deleteEvent = async (eventId: string) => {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) { console.error('[deleteEvent]', error); throw new Error(error.message); }
    await fetchEvents();
  };

  const toggleLikeEvent = async (eventId: string) => {
    if (!user) return;
    const liked = isEventLiked(eventId);
    const { error } = liked
      ? await supabase.from('event_likes').delete().eq('event_id', eventId).eq('user_id', user.id)
      : await supabase.from('event_likes').insert({ event_id: eventId, user_id: user.id });
    if (error) console.error('[toggleLikeEvent]', error);
    await fetchEvents();
  };

  const addCommentToEvent = async (eventId: string, text: string) => {
    if (!user || !text.trim()) return;
    const { error } = await supabase.from('event_comments').insert({
      event_id: eventId,
      author_id: user.id,
      text: text.trim(),
    });
    if (error) { console.error('[addCommentToEvent]', error); throw new Error(error.message); }
    await fetchEvents();
  };

  const toggleRSVPEvent = async (eventId: string) => {
    if (!user) return;
    const rsvped = hasRSVPed(eventId);
    const { error } = rsvped
      ? await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
      : await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: user.id });
    if (error) console.error('[toggleRSVPEvent]', error);
    await fetchEvents();
  };

  const isEventLiked = (eventId: string): boolean => {
    if (!user) return false;
    const event = events.find(e => e.id === eventId);
    return event ? event.likes.includes(user.id) : false;
  };

  const hasRSVPed = (eventId: string): boolean => {
    if (!user) return false;
    const event = events.find(e => e.id === eventId);
    return event ? event.participants.includes(user.id) : false;
  };

  // Marketplace — Supabase-backed
  const addMarketplaceItem = async (itemData: any) => {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('marketplace_items').insert({
      title: itemData.title,
      category: itemData.category,
      price: itemData.price,
      condition: itemData.condition,
      description: itemData.description,
      image_url: itemData.image || null,
      seller_id: user.id,
      contact: itemData.seller.contact,
    });
    if (error) {
      console.error('[addMarketplaceItem]', error);
      throw new Error(error.message);
    }
    await fetchMarketplaceItems();
  };

  const deleteMarketplaceItem = async (itemId: string) => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('marketplace_items').delete().eq('id', itemId).select('id');
    if (error) {
      console.error('[deleteMarketplaceItem]', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      throw new Error('Delete rejected — you may not have permission.');
    }
    await fetchMarketplaceItems();
  };

  const toggleSaveItem = async (itemId: string) => {
    if (!user) return;
    const saved = isItemSaved(itemId);
    const { error } = saved
      ? await supabase.from('marketplace_saves').delete().eq('item_id', itemId).eq('user_id', user.id)
      : await supabase.from('marketplace_saves').insert({ item_id: itemId, user_id: user.id });
    if (error) console.error('[toggleSaveItem]', error);
    await fetchMarketplaceItems();
  };

  const incrementItemViews = async (itemId: string) => {
    // Optimistic local update for immediate feedback
    setMarketplaceItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, views: item.views + 1 } : item
    ));
    // Persist via RPC (SECURITY DEFINER bypasses RLS)
    const { error } = await supabase.rpc('increment_marketplace_views', { item_id: itemId });
    if (error) console.error('[incrementItemViews]', error);
  };

  const isItemSaved = (itemId: string): boolean => {
    if (!user) return false;
    const item = marketplaceItems.find(i => i.id === itemId);
    return item ? item.savedBy.includes(user.id) : false;
  };

  const getUserPosts = () => user ? posts.filter(p => p.authorId === user.id) : [];
  const getUserEvents = () => user ? events.filter(e => e.participants.includes(user.id)) : [];
  const getUserMarketplaceItems = () => user ? marketplaceItems.filter(item => item.seller.id === user.id) : [];
  const getUserSavedItems = () => user ? marketplaceItems.filter(item => item.savedBy.includes(user.id)) : [];
  const getUserStats = () => ({
    posts: getUserPosts().length,
    eventsAttended: getUserEvents().length,
    itemsSold: getUserMarketplaceItems().length,
    savedItems: getUserSavedItems().length,
  });

  return (
    <DataContext.Provider value={{
      posts, events, marketplaceItems,
      addPost, updatePost, deletePost, toggleLikePost, addCommentToPost, deleteCommentFromPost, isPostLiked,
      addEvent, updateEvent, deleteEvent, toggleLikeEvent, addCommentToEvent, toggleRSVPEvent, isEventLiked, hasRSVPed,
      addMarketplaceItem, deleteMarketplaceItem, toggleSaveItem, incrementItemViews, isItemSaved,
      getUserPosts, getUserEvents, getUserMarketplaceItems, getUserSavedItems, getUserStats,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};