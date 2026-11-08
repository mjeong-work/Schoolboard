import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
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
  // Ordered photo gallery — images[0] is the cover/thumbnail image.
  images: string[];
  seller: {
    name: string;
    contact: string;
    verified: boolean;
    id: string;
  };
  postedDate: string;
  views: number;
  savedBy: string[];
  comments: Comment[];
  // Optional real meetup spot (Google Places) — never fabricated; only
  // present when the seller actually picked one.
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  googlePlaceId?: string;
  locationRadiusMeters?: number;
}

interface DataContextType {
  posts: Post[];
  events: Event[];
  marketplaceItems: MarketplaceItem[];
  isLoading: boolean;
  /** True when the initial load of posts/events/listings failed; retryLoad() tries again. */
  loadError: boolean;
  retryLoad: () => Promise<void>;
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
  deleteCommentFromEvent: (eventId: string, commentId: string) => Promise<void>;
  toggleRSVPEvent: (eventId: string) => Promise<void>;
  isEventLiked: (eventId: string) => boolean;
  hasRSVPed: (eventId: string) => boolean;
  addMarketplaceItem: (item: Omit<MarketplaceItem, 'id' | 'postedDate' | 'views' | 'savedBy' | 'comments' | 'seller'> & { seller: Omit<MarketplaceItem['seller'], 'id'> }) => Promise<void>;
  updateMarketplaceItem: (itemId: string, updates: {
    title: string; category: string; price: number; condition: string; description: string; images: string[];
    locationName?: string; locationAddress?: string; locationLat?: number; locationLng?: number; googlePlaceId?: string;
  }) => Promise<void>;
  deleteMarketplaceItem: (itemId: string) => Promise<void>;
  toggleSaveItem: (itemId: string) => Promise<void>;
  incrementItemViews: (itemId: string) => Promise<void>;
  isItemSaved: (itemId: string) => boolean;
  addCommentToMarketplaceItem: (itemId: string, text: string) => Promise<void>;
  deleteCommentFromMarketplaceItem: (itemId: string, commentId: string) => Promise<void>;
  getUserPosts: () => Post[];
  getUserEvents: () => Event[];
  getUserMarketplaceItems: () => MarketplaceItem[];
  getUserSavedItems: () => MarketplaceItem[];
  getUserStats: () => { posts: number; eventsAttended: number; listings: number; savedItems: number };
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Ids with a like/save request still in flight. A second tap before the
  // first request settles is ignored — otherwise an insert and a delete can
  // race to the server and leave it out of sync with what the UI shows.
  const pendingLikesRef = useRef<Set<string>>(new Set());
  const pendingSavesRef = useRef<Set<string>>(new Set());

  // Fetch posts from Supabase. Returns false on failure so the initial load
  // can surface an error state instead of an indistinguishable empty feed.
  const fetchPosts = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        post_likes (user_id),
        post_comments (id, author_id, text, created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) { console.error('[fetchPosts]', error); return false; }

    const formatted: Post[] = (data || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      image: p.image_url,
      category: p.category,
      author: getAnonymousName(p.id),
      authorId: p.author_id,
      verified: false,
      // Full timestamp, not the UTC date — a date-only string parses as UTC
      // midnight, so posts showed the wrong day ("Yesterday", or the previous
      // date on the profile page) for anyone not in UTC, and same-day posts
      // couldn't be ordered by time.
      date: p.created_at,
      likes: (p.post_likes || []).map((l: any) => l.user_id),
      // Full timestamp (not date-only) — comment "just now"/"5m"/"2h" relative
      // formatting needs the time component, otherwise a comment posted minutes
      // ago can render as several hours old depending on time of day.
      comments: (p.post_comments || []).map((c: any) => ({
        id: c.id,
        text: c.text,
        author: getAnonymousName(c.id),
        authorId: c.author_id,
        date: c.created_at,
      })),
    }));

    setPosts(formatted);
    return true;
  };

  const MARKETPLACE_ITEM_SELECT = `
    *,
    marketplace_saves (user_id),
    marketplace_comments (id, author_id, text, created_at)
  `;

  // Shared row -> MarketplaceItem mapping, used by the full-list fetch and
  // by create/update (which return the joined row directly) so a single
  // mutation doesn't need to re-download and re-map the entire marketplace.
  const formatMarketplaceItem = (item: any): MarketplaceItem => ({
    id: item.id,
    title: item.title,
    category: item.category,
    price: Number(item.price),
    condition: item.condition,
    description: item.description,
    // Older rows only have image_url (pre-multi-image); fall back to that
    // as a single-element gallery so they still render correctly.
    images: (item.images && item.images.length > 0)
      ? item.images
      : (item.image_url ? [item.image_url] : []),
    seller: {
      name: getAnonymousName(item.id),
      contact: item.contact,
      verified: false,
      id: item.seller_id,
    },
    // Full timestamp, not just the date — comment/post "just now" style
    // relative-time formatting needs the time component too, otherwise
    // it can appear many hours off depending on the viewer's timezone.
    postedDate: item.created_at,
    views: item.views,
    savedBy: (item.marketplace_saves || []).map((s: any) => s.user_id),
    comments: (item.marketplace_comments || []).map((c: any) => ({
      id: c.id,
      text: c.text,
      author: getAnonymousName(c.id),
      authorId: c.author_id,
      date: c.created_at,
    })),
    locationName: item.location_name ?? undefined,
    locationAddress: item.location_address ?? undefined,
    locationLat: item.location_lat ?? undefined,
    locationLng: item.location_lng ?? undefined,
    googlePlaceId: item.google_place_id ?? undefined,
    locationRadiusMeters: item.location_radius_meters ?? 150,
  });

  // Fetch marketplace items from Supabase
  const fetchMarketplaceItems = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('marketplace_items')
      .select(MARKETPLACE_ITEM_SELECT)
      .order('created_at', { ascending: false });

    if (error) { console.error('[fetchMarketplaceItems]', error); return false; }

    setMarketplaceItems((data || []).map(formatMarketplaceItem));
    return true;
  };

  const loadAll = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const results = await Promise.all([fetchPosts(), fetchEvents(), fetchMarketplaceItems()]);
      if (results.includes(false)) setLoadError(true);
    } catch (err) {
      console.error('[loadAll]', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Keyed on the user's id, not the user object: AuthProvider replaces the
  // object on every auth event (hourly token refresh, tab refocus, profile
  // edit), and depending on its identity re-downloaded the entire feed,
  // events list, and marketplace each time — undoing the "no full refetch"
  // optimization and flashing the loading state mid-session.
  const userId = user?.id;
  useEffect(() => {
    if (userId) {
      loadAll();
    } else {
      // Signed out — drop the previous account's data so it can't flash
      // up for whoever signs in next on the same device.
      setPosts([]);
      setEvents([]);
      setMarketplaceItems([]);
      setLoadError(false);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Posts
  //
  // addPost/updatePost/deletePost/toggleLikePost/addCommentToPost/deleteCommentFromPost
  // all used to call fetchPosts() (a full re-download of every post plus its
  // author profile, every like, and every comment+author) after every single
  // mutation. That round trip was the direct cause of posts/likes/comments
  // feeling slow to appear — each one re-fetched the entire feed just to
  // reflect a one-row change. These now apply the confirmed server result
  // directly to local state instead.
  const addPost = async (postData: Omit<Post, 'id' | 'date' | 'likes' | 'comments' | 'authorId' | 'author' | 'verified'>) => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('posts').insert({
      title: postData.title,
      content: postData.content,
      image_url: postData.image,
      category: postData.category,
      author_id: user.id,
    }).select('id, created_at').single();
    if (error) {
      console.error('[addPost] Supabase error:', error);
      throw new Error(error.message);
    }
    const newPost: Post = {
      id: data.id,
      title: postData.title,
      content: postData.content,
      image: postData.image,
      category: postData.category,
      author: getAnonymousName(data.id),
      authorId: user.id,
      verified: user.verified,
      date: data.created_at ?? new Date().toISOString(),
      likes: [],
      comments: [],
    };
    setPosts(prev => [newPost, ...prev]);
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
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return {
        ...p,
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.content !== undefined && { content: updates.content }),
        ...(updates.image !== undefined && { image: updates.image }),
        ...(updates.category !== undefined && { category: updates.category as Post['category'] }),
      };
    }));
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
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const toggleLikePost = async (postId: string) => {
    if (!user || pendingLikesRef.current.has(postId)) return;
    pendingLikesRef.current.add(postId);
    const liked = isPostLiked(postId);

    // Optimistic update — a like shouldn't have to wait on a round trip
    // (or a full feed re-fetch) to feel responsive.
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return { ...p, likes: liked ? p.likes.filter(id => id !== user.id) : [...p.likes.filter(id => id !== user.id), user.id] };
    }));

    let error;
    try {
      ({ error } = liked
        ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
        : await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id }));
    } finally {
      pendingLikesRef.current.delete(postId);
    }

    // 23505 = unique violation: the like already exists server-side (e.g.
    // liked from another tab), which is the state we wanted anyway.
    if (error && error.code !== '23505') {
      console.error('[toggleLikePost] Supabase error:', error);
      // Roll back since it didn't actually persist.
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return { ...p, likes: liked ? [...p.likes.filter(id => id !== user.id), user.id] : p.likes.filter(id => id !== user.id) };
      }));
      throw new Error(error.message);
    }
  };

  const addCommentToPost = async (postId: string, text: string) => {
    if (!user || !text.trim()) return;
    const trimmed = text.trim();
    const { data, error } = await supabase.from('post_comments').insert({
      post_id: postId,
      author_id: user.id,
      text: trimmed,
    }).select('id, created_at').single();
    if (error) {
      console.error('[addCommentToPost] Supabase error:', error);
      throw new Error(error.message);
    }
    const newComment: Comment = {
      id: data.id,
      author: getAnonymousName(data.id),
      authorId: user.id,
      text: trimmed,
      date: data.created_at ?? new Date().toISOString(),
    };
    setPosts(prev => prev.map(p => (p.id === postId ? { ...p, comments: [...p.comments, newComment] } : p)));
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
    setPosts(prev => prev.map(p => (p.id === postId ? { ...p, comments: p.comments.filter(c => c.id !== commentId) } : p)));
  };

  const isPostLiked = (postId: string): boolean => {
    if (!user) return false;
    const post = posts.find(p => p.id === postId);
    return post ? post.likes.includes(user.id) : false;
  };

  // Fetch events from Supabase
  const fetchEvents = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        event_rsvps (user_id),
        event_likes (user_id),
        event_comments (id, author_id, text, created_at)
      `)
      .order('date', { ascending: true });

    if (error) { console.error('[fetchEvents]', error); return false; }

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
      author: getAnonymousName(e.id),
      authorId: e.author_id,
      participants: (e.event_rsvps || []).map((r: any) => r.user_id),
      likes: (e.event_likes || []).map((l: any) => l.user_id),
      // Full timestamp — see the matching note on fetchPosts' comment mapping.
      comments: (e.event_comments || []).map((c: any) => ({
        id: c.id,
        text: c.text,
        author: getAnonymousName(c.id),
        authorId: c.author_id,
        date: c.created_at,
      })),
    }));

    setEvents(formatted);
    return true;
  };

  const sortEventsByDate = (list: Event[]) =>
    [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Events — Supabase-backed
  const addEvent = async (eventData: Omit<Event, 'id' | 'likes' | 'comments' | 'participants' | 'authorId' | 'author'>) => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('events').insert({
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
    }).select('id').single();
    if (error) { console.error('[addEvent]', error); throw new Error(error.message); }
    const newEvent: Event = {
      ...eventData,
      id: data.id,
      author: getAnonymousName(data.id),
      authorId: user.id,
      participants: [],
      likes: [],
      comments: [],
    };
    setEvents(prev => sortEventsByDate([...prev, newEvent]));
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

    const todayStr = new Date().toLocaleDateString('en-CA');
    const { data, error } = await supabase
      .from('events')
      .update(dbUpdates)
      .eq('id', eventId)
      .gte('date', todayStr)
      .select('id');
    if (error) { console.error('[updateEvent]', error); throw new Error(error.message); }
    if (!data || data.length === 0) {
      throw new Error('Past events are view-only and cannot be edited.');
    }
    setEvents(prev => sortEventsByDate(prev.map(e => (e.id === eventId ? { ...e, ...updates } : e))));
  };

  const deleteEvent = async (eventId: string) => {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) { console.error('[deleteEvent]', error); throw new Error(error.message); }
    setEvents(prev => prev.filter(e => e.id !== eventId));
  };

  const toggleLikeEvent = async (eventId: string) => {
    if (!user) return;
    const liked = isEventLiked(eventId);

    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      return { ...e, likes: liked ? e.likes.filter(id => id !== user.id) : [...e.likes, user.id] };
    }));

    const { error } = liked
      ? await supabase.from('event_likes').delete().eq('event_id', eventId).eq('user_id', user.id)
      : await supabase.from('event_likes').insert({ event_id: eventId, user_id: user.id });

    if (error) {
      console.error('[toggleLikeEvent]', error);
      setEvents(prev => prev.map(e => {
        if (e.id !== eventId) return e;
        return { ...e, likes: liked ? [...e.likes, user.id] : e.likes.filter(id => id !== user.id) };
      }));
    }
  };

  const addCommentToEvent = async (eventId: string, text: string) => {
    if (!user || !text.trim()) return;
    const trimmed = text.trim();
    const { data, error } = await supabase.from('event_comments').insert({
      event_id: eventId,
      author_id: user.id,
      text: trimmed,
    }).select('id, created_at').single();
    if (error) { console.error('[addCommentToEvent]', error); throw new Error(error.message); }
    const newComment: Comment = {
      id: data.id,
      author: getAnonymousName(data.id),
      authorId: user.id,
      text: trimmed,
      date: data.created_at ?? new Date().toISOString(),
    };
    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, comments: [...e.comments, newComment] } : e)));
  };

  const deleteCommentFromEvent = async (eventId: string, commentId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('event_comments')
      .delete()
      .eq('id', commentId)
      .select('id');
    if (error) {
      console.error('[deleteCommentFromEvent] Supabase error:', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      console.warn('[deleteCommentFromEvent] No rows deleted — RLS may be blocking for commentId:', commentId);
      throw new Error('Delete was rejected — you may not have permission to delete this comment.');
    }
    setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, comments: e.comments.filter(c => c.id !== commentId) } : e)));
  };

  const toggleRSVPEvent = async (eventId: string) => {
    if (!user) return;
    const rsvped = hasRSVPed(eventId);

    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      return { ...e, participants: rsvped ? e.participants.filter(id => id !== user.id) : [...e.participants, user.id] };
    }));

    const { error } = rsvped
      ? await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
      : await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: user.id });

    if (error) {
      console.error('[toggleRSVPEvent]', error);
      setEvents(prev => prev.map(e => {
        if (e.id !== eventId) return e;
        return { ...e, participants: rsvped ? [...e.participants, user.id] : e.participants.filter(id => id !== user.id) };
      }));
    }
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
    const { data, error } = await supabase.from('marketplace_items').insert({
      title: itemData.title,
      category: itemData.category,
      price: itemData.price,
      condition: itemData.condition,
      description: itemData.description,
      // image_url stays populated with the cover photo for anything that
      // still only reads the single-image column; images holds the full gallery.
      image_url: itemData.images?.[0] || null,
      images: itemData.images ?? [],
      seller_id: user.id,
      contact: itemData.seller.contact,
      location_name: itemData.locationName ?? null,
      location_address: itemData.locationAddress ?? null,
      location_lat: itemData.locationLat ?? null,
      location_lng: itemData.locationLng ?? null,
      google_place_id: itemData.googlePlaceId ?? null,
    }).select(MARKETPLACE_ITEM_SELECT).single();
    if (error) {
      console.error('[addMarketplaceItem]', error);
      throw new Error(error.message);
    }
    setMarketplaceItems(prev => [formatMarketplaceItem(data), ...prev]);
  };

  const updateMarketplaceItem = async (itemId: string, updates: {
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
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('marketplace_items')
      .update({
        title: updates.title,
        category: updates.category,
        price: updates.price,
        condition: updates.condition,
        description: updates.description,
        image_url: updates.images?.[0] || null,
        images: updates.images ?? [],
        location_name: updates.locationName ?? null,
        location_address: updates.locationAddress ?? null,
        location_lat: updates.locationLat ?? null,
        location_lng: updates.locationLng ?? null,
        google_place_id: updates.googlePlaceId ?? null,
      })
      .eq('id', itemId)
      // Return the full joined row from the update itself rather than
      // issuing a second refetch request afterwards.
      .select(MARKETPLACE_ITEM_SELECT);
    if (error) {
      console.error('[updateMarketplaceItem]', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      throw new Error('Update rejected — you may not have permission.');
    }
    const updated = formatMarketplaceItem(data[0]);
    setMarketplaceItems(prev => prev.map(item => (item.id === itemId ? updated : item)));
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
    // Deleted server-side and confirmed — drop it locally instead of
    // re-fetching the whole marketplace just to notice it's gone.
    setMarketplaceItems(prev => prev.filter(item => item.id !== itemId));
  };

  const toggleSaveItem = async (itemId: string) => {
    if (!user || pendingSavesRef.current.has(itemId)) return;
    pendingSavesRef.current.add(itemId);
    const saved = isItemSaved(itemId);

    // Optimistic local update — saving/unsaving shouldn't have to wait on
    // (or trigger) a full marketplace re-fetch to feel responsive.
    setMarketplaceItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        savedBy: saved
          ? item.savedBy.filter(id => id !== user.id)
          : [...item.savedBy.filter(id => id !== user.id), user.id],
      };
    }));

    let error;
    try {
      ({ error } = saved
        ? await supabase.from('marketplace_saves').delete().eq('item_id', itemId).eq('user_id', user.id)
        : await supabase.from('marketplace_saves').insert({ item_id: itemId, user_id: user.id }));
    } finally {
      pendingSavesRef.current.delete(itemId);
    }

    // 23505 = already saved server-side — the state we wanted anyway.
    if (error && error.code !== '23505') {
      console.error('[toggleSaveItem]', error);
      // Roll back the optimistic update since it didn't actually persist.
      setMarketplaceItems(prev => prev.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          savedBy: saved
            ? [...item.savedBy.filter(id => id !== user.id), user.id]
            : item.savedBy.filter(id => id !== user.id),
        };
      }));
      throw new Error(error.message);
    }
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

  const addCommentToMarketplaceItem = async (itemId: string, text: string) => {
    if (!user || !text.trim()) return;
    const trimmed = text.trim();
    const { data, error } = await supabase.from('marketplace_comments').insert({
      item_id: itemId,
      author_id: user.id,
      text: trimmed,
    }).select('id, created_at').single();
    if (error) { console.error('[addCommentToMarketplaceItem]', error); throw new Error(error.message); }
    // Same pattern as post comments: append the confirmed row locally
    // instead of re-downloading the listing.
    const newComment: Comment = {
      id: data.id,
      author: getAnonymousName(data.id),
      authorId: user.id,
      text: trimmed,
      date: data.created_at ?? new Date().toISOString(),
    };
    setMarketplaceItems(prev => prev.map(item => (
      item.id === itemId ? { ...item, comments: [...item.comments, newComment] } : item
    )));
  };

  const deleteCommentFromMarketplaceItem = async (itemId: string, commentId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('marketplace_comments')
      .delete()
      .eq('id', commentId)
      .select('id');
    if (error) {
      console.error('[deleteCommentFromMarketplaceItem] Supabase error:', error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      console.warn('[deleteCommentFromMarketplaceItem] No rows deleted — RLS may be blocking for commentId:', commentId);
      throw new Error('Delete was rejected — you may not have permission to delete this comment.');
    }
    setMarketplaceItems(prev => prev.map(item => (
      item.id === itemId ? { ...item, comments: item.comments.filter(c => c.id !== commentId) } : item
    )));
  };

  const getUserPosts = () => user ? posts.filter(p => p.authorId === user.id) : [];
  const getUserEvents = () => user ? events.filter(e => e.participants.includes(user.id)) : [];
  const getUserMarketplaceItems = () => user ? marketplaceItems.filter(item => item.seller.id === user.id) : [];
  const getUserSavedItems = () => user ? marketplaceItems.filter(item => item.savedBy.includes(user.id)) : [];
  const getUserStats = () => ({
    posts: getUserPosts().length,
    eventsAttended: getUserEvents().length,
    listings: getUserMarketplaceItems().length,
    savedItems: getUserSavedItems().length,
  });

  // Memoize the provider value so a change to just one of posts/events/
  // marketplaceItems doesn't hand every consumer (including ones that only
  // read a different slice) a brand-new object on every render — without
  // this, the whole component subtree under DataProvider re-renders on
  // every single like/comment/RSVP anywhere in the app.
  const value = useMemo<DataContextType>(() => ({
    posts, events, marketplaceItems, isLoading, loadError, retryLoad: loadAll,
    addPost, updatePost, deletePost, toggleLikePost, addCommentToPost, deleteCommentFromPost, isPostLiked,
    addEvent, updateEvent, deleteEvent, toggleLikeEvent, addCommentToEvent, deleteCommentFromEvent, toggleRSVPEvent, isEventLiked, hasRSVPed,
    addMarketplaceItem, updateMarketplaceItem, deleteMarketplaceItem, toggleSaveItem, incrementItemViews, isItemSaved,
    addCommentToMarketplaceItem, deleteCommentFromMarketplaceItem,
    getUserPosts, getUserEvents, getUserMarketplaceItems, getUserSavedItems, getUserStats,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [posts, events, marketplaceItems, isLoading, loadError, user]);

  return (
    <DataContext.Provider value={value}>
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
