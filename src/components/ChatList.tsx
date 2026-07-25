import React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { useChat } from '../utils/chatContext';
import { useAuth } from '../utils/authContext';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

interface ChatListProps {
  onSelectConversation: (conversationId: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ onSelectConversation }) => {
  const { currentUser } = useAuth();
  const { conversations, getConversationMessages, deleteConversation } = useChat();

  // Filter conversations where current user is a participant
  const userConversations = conversations.filter((conv) =>
    conv.participants.some((p) => p.userId === currentUser?.id)
  );

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getUnreadCount = (conversationId: string): number => {
    if (!currentUser) return 0;
    const messages = getConversationMessages(conversationId);
    return messages.filter((msg) => !msg.read && msg.senderId !== currentUser.id).length;
  };

  const handleDelete = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation(conversationId);
  };

  if (userConversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#f1f5f9] to-[#e2e8f0] flex items-center justify-center mx-auto mb-5">
          <MessageSquare size={36} className="text-[#cbd5e1]" strokeWidth={2} />
        </div>
        <h3 className="text-[#0f172a] font-semibold mb-2">No messages yet</h3>
        <p className="text-[#64748b] text-sm leading-relaxed max-w-[240px]">
          Start a conversation by contacting a seller or event host
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-[#e5e5e5]">
        {userConversations.map((conversation) => {
          const otherParticipant = conversation.participants.find(
            (p) => p.userId !== currentUser?.id
          );
          const unreadCount = getUnreadCount(conversation.id);
          const lastMessageTime = conversation.lastMessage?.timestamp || conversation.createdAt;

          return (
            <div
              key={conversation.id}
              className={`flex items-center gap-3.5 px-5 py-4 hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-transparent cursor-pointer transition-all border-b border-[#e2e8f0] last:border-b-0 ${unreadCount > 0 ? 'bg-indigo-50/30' : ''}`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0 shadow-md ring-2 ring-white" style={{ background: getAvatarColor(otherParticipant?.userId || conversation.id) }}>
                <span className="font-semibold text-lg">{otherParticipant?.userName.charAt(0).toUpperCase()}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className={`text-sm truncate ${unreadCount > 0 ? 'text-[#0f172a] font-semibold' : 'text-[#0f172a] font-medium'}`}>
                    {otherParticipant?.userName}
                  </h4>
                  <span className="text-[11px] text-[#94a3b8] shrink-0 font-medium">
                    {formatTime(lastMessageTime)}
                  </span>
                </div>

                {conversation.context && (
                  <div className="text-[11px] text-[#64748b] mb-1 truncate">
                    Re: {conversation.context.itemTitle}
                  </div>
                )}

                {conversation.lastMessage && (
                  <p
                    className={`text-xs truncate leading-relaxed ${
                      unreadCount > 0 ? 'text-[#475569] font-medium' : 'text-[#94a3b8]'
                    }`}
                  >
                    {conversation.lastMessage.senderId === currentUser?.id && 'You: '}
                    {conversation.lastMessage.imageUrl && !conversation.lastMessage.content
                      ? '📷 Image'
                      : conversation.lastMessage.content}
                  </p>
                )}
              </div>

              {/* Unread badge & Delete */}
              <div className="flex items-center gap-2 shrink-0">
                {unreadCount > 0 && (
                  <div className="min-w-[22px] h-[22px] px-2 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white text-[11px] flex items-center justify-center font-semibold shadow-md shadow-indigo-500/30">
                    {unreadCount}
                  </div>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:bg-red-50 hover:text-red-600 transition-all rounded-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 size={16} className="text-[#94a3b8]" strokeWidth={2} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this conversation and all its messages.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={(e) => handleDelete(conversation.id, e)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};