import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { useAuth } from './authContext';
import { supabase } from './supabaseClient';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  imageUrl?: string;
  timestamp: number;
  read: boolean;
}

export interface Conversation {
  id: string;
  participants: {
    userId: string;
    userName: string;
  }[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: number;
  context?: {
    type: 'marketplace' | 'event';
    itemId: string;
    itemTitle: string;
  };
}

interface ChatContextType {
  conversations: Conversation[];
  messages: Message[];
  // NOTE: async — callers must await before calling sendMessage
  getOrCreateConversation: (otherUserId: string, otherUserName: string, context?: Conversation['context']) => Promise<string>;
  sendMessage: (conversationId: string, content: string, imageUrl?: string) => void;
  markAsRead: (conversationId: string) => void;
  getConversationMessages: (conversationId: string) => Message[];
  getConversation: (conversationId: string) => Conversation | undefined;
  getTotalUnreadCount: () => number;
  deleteConversation: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Map a raw Supabase messages row → Message
const rowToMessage = (m: Record<string, any>): Message => ({
  id: m.id,
  conversationId: m.conversation_id,
  senderId: m.sender_id ?? '',
  senderName: m.sender_name,
  content: m.content,
  imageUrl: m.image_url ?? undefined,
  timestamp: new Date(m.created_at).getTime(),
  read: m.read,
});

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setConversations([]);
      setMessages([]);
      return;
    }

    loadData(currentUser.id);
    setupRealtime(currentUser.id);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentUser?.id]);

  // ── Load all conversations + messages from Supabase ──────────────────
  const loadData = async (userId: string) => {
    // Find which conversations this user is in
    const { data: participantRows, error: pErr } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (pErr) { console.error('[loadData] participants:', pErr.message); return; }
    if (!participantRows?.length) return;

    const convIds = participantRows.map((p) => p.conversation_id);

    // Load conversations with all their participants
    const { data: convRows, error: cErr } = await supabase
      .from('conversations')
      .select('id, created_at, context_type, context_item_id, context_item_title, conversation_participants(user_id, user_name)')
      .in('id', convIds)
      .order('created_at', { ascending: false });

    if (cErr) { console.error('[loadData] conversations:', cErr.message); return; }

    // Load all messages for those conversations
    const { data: msgRows, error: mErr } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });

    if (mErr) { console.error('[loadData] messages:', mErr.message); return; }

    const msgs: Message[] = (msgRows ?? []).map(rowToMessage);
    setMessages(msgs);

    const convs: Conversation[] = (convRows ?? []).map((c) => {
      const convMsgs = msgs.filter((m) => m.conversationId === c.id);
      const lastMsg = convMsgs[convMsgs.length - 1];
      const unreadCount = convMsgs.filter((m) => !m.read && m.senderId !== userId).length;

      return {
        id: c.id,
        participants: (c.conversation_participants as any[]).map((p) => ({
          userId: p.user_id,
          userName: p.user_name,
        })),
        lastMessage: lastMsg,
        unreadCount,
        createdAt: new Date(c.created_at).getTime(),
        context: c.context_type
          ? { type: c.context_type as 'marketplace' | 'event', itemId: c.context_item_id, itemTitle: c.context_item_title }
          : undefined,
      };
    });

    setConversations(convs);
  };

  // ── Realtime: receive new messages from other users ───────────────────
  const setupRealtime = (userId: string) => {
    const channel = supabase
      .channel(`chat:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const raw = payload.new as Record<string, any>;

          // Own messages are already handled by optimistic update in sendMessage
          if (raw.sender_id === userId) return;

          const message = rowToMessage(raw);

          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message]
          );

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id !== message.conversationId
                ? conv
                : { ...conv, lastMessage: message, unreadCount: conv.unreadCount + 1 }
            )
          );
        }
      )
      .subscribe();

    channelRef.current = channel;
  };

  // ── getOrCreateConversation ───────────────────────────────────────────
  const getOrCreateConversation = useCallback(async (
    otherUserId: string,
    otherUserName: string,
    context?: Conversation['context']
  ): Promise<string> => {
    if (!currentUser) return '';

    // Fast path: already in local state
    const existing = conversations.find((conv) => {
      const ids = conv.participants.map((p) => p.userId);
      return ids.includes(currentUser.id) && ids.includes(otherUserId) && ids.length === 2;
    });
    if (existing) return existing.id;

    // Check Supabase in case it was created from another session
    const { data: myRows } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', currentUser.id);

    if (myRows?.length) {
      const myIds = myRows.map((r) => r.conversation_id);
      const { data: otherRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', otherUserId)
        .in('conversation_id', myIds);

      if (otherRows?.length) return otherRows[0].conversation_id;
    }

    // Generate the UUID client-side.
    // We CANNOT use .select().single() after INSERT because the conversations
    // SELECT policy requires the user to already be in conversation_participants —
    // which is only true after the next step. Providing the ID up-front avoids
    // the post-insert SELECT entirely.
    const newId = crypto.randomUUID();

    const { error: cErr } = await supabase
      .from('conversations')
      .insert({
        id: newId,
        context_type: context?.type ?? null,
        context_item_id: context?.itemId ?? null,
        context_item_title: context?.itemTitle ?? null,
      });

    if (cErr) {
      console.error('[getOrCreateConversation] conversations insert:', cErr.message);
      return '';
    }

    const { error: pErr } = await supabase.from('conversation_participants').insert([
      { conversation_id: newId, user_id: currentUser.id, user_name: currentUser.name },
      { conversation_id: newId, user_id: otherUserId, user_name: otherUserName },
    ]);

    if (pErr) {
      console.error('[getOrCreateConversation] participants insert:', pErr.message);
      // Clean up the orphaned conversation row so the DB stays consistent
      await supabase.from('conversations').delete().eq('id', newId);
      return '';
    }

    const conversation: Conversation = {
      id: newId,
      participants: [
        { userId: currentUser.id, userName: currentUser.name },
        { userId: otherUserId, userName: otherUserName },
      ],
      unreadCount: 0,
      createdAt: Date.now(),
      context,
    };

    setConversations((prev) => [conversation, ...prev]);
    return newId;
  }, [currentUser, conversations]);

  // ── sendMessage (optimistic) ──────────────────────────────────────────
  const sendMessage = useCallback((conversationId: string, content: string, imageUrl?: string) => {
    if (!currentUser) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      content,
      imageUrl,
      timestamp: Date.now(),
      read: false,
    };

    // Optimistic update
    setMessages((prev) => [...prev, optimistic]);
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId ? { ...conv, lastMessage: optimistic } : conv
      )
    );

    // Persist to Supabase. Do NOT chain .select() — if the post-insert SELECT
    // fails (e.g. RLS race), we would roll back the optimistic message and the
    // user would see an empty conversation even though the row was saved.
    // The optimistic message already has all the data needed to render correctly.
    supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        content,
        image_url: imageUrl ?? null,
        read: false,
      })
      .then(({ error }) => {
        if (error) {
          console.error('[sendMessage] insert failed:', error.message);
          // Only roll back if the INSERT itself failed (message was never saved)
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === conversationId && conv.lastMessage?.id === tempId
                ? { ...conv, lastMessage: undefined }
                : conv
            )
          );
        }
      });
  }, [currentUser]);

  // ── markAsRead ────────────────────────────────────────────────────────
  const markAsRead = useCallback((conversationId: string) => {
    if (!currentUser) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.conversationId === conversationId && m.senderId !== currentUser.id
          ? { ...m, read: true }
          : m
      )
    );
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
      )
    );

    supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', currentUser.id)
      .eq('read', false)
      .then(({ error }) => {
        if (error) console.error('[markAsRead]', error.message);
      });
  }, [currentUser]);

  // ── getConversationMessages ───────────────────────────────────────────
  const getConversationMessages = useCallback((conversationId: string): Message[] =>
    messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.timestamp - b.timestamp), [messages]);

  // ── getConversation ───────────────────────────────────────────────────
  const getConversation = useCallback((conversationId: string): Conversation | undefined =>
    conversations.find((c) => c.id === conversationId), [conversations]);

  // ── getTotalUnreadCount ───────────────────────────────────────────────
  const getTotalUnreadCount = useCallback((): number =>
    conversations.reduce((sum, conv) => sum + conv.unreadCount, 0), [conversations]);

  // ── deleteConversation ────────────────────────────────────────────────
  const deleteConversation = useCallback((conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    setMessages((prev) => prev.filter((m) => m.conversationId !== conversationId));

    supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.error('[deleteConversation]', error.message);
      });
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      messages,
      getOrCreateConversation,
      sendMessage,
      markAsRead,
      getConversationMessages,
      getConversation,
      getTotalUnreadCount,
      deleteConversation,
    }),
    [
      conversations,
      messages,
      getOrCreateConversation,
      sendMessage,
      markAsRead,
      getConversationMessages,
      getConversation,
      getTotalUnreadCount,
      deleteConversation,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
