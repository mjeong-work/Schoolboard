import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Minimize2, Maximize2 } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { useChat } from '../utils/chatContext';
import { useAuth } from '../utils/authContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface ChatWindowProps {
  conversationId: string;
  onClose: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  onClose,
  onMinimize,
  isMinimized = false,
}) => {
  console.log('🟡 ChatWindow rendering with conversationId:', conversationId);
  
  const { currentUser } = useAuth();
  const { getConversation, getConversationMessages, sendMessage, markAsRead } = useChat();
  const [messageText, setMessageText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conversation = getConversation(conversationId);
  const messages = getConversationMessages(conversationId);
  
  console.log('🟡 ChatWindow conversation:', conversation);
  console.log('🟡 ChatWindow currentUser:', currentUser);
  console.log('🟡 ChatWindow messages:', messages);

  // Get the other participant's name
  const otherParticipant = conversation?.participants.find(
    (p) => p.userId !== currentUser?.id
  );

  useEffect(() => {
    // Mark messages as read when chat is opened
    if (!isMinimized) {
      markAsRead(conversationId);
    }
  }, [conversationId, isMinimized, markAsRead]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  const handleSend = () => {
    if (messageText.trim() || imagePreview) {
      sendMessage(conversationId, messageText, imagePreview || undefined);
      setMessageText('');
      setImagePreview(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  if (!conversation || !currentUser) {
    console.log('❌ ChatWindow returning null - conversation:', conversation, 'currentUser:', currentUser);
    return null;
  }
  
  console.log('✅ ChatWindow will render');

  // Determine chat title based on context
  const chatTitle = conversation.context?.type === 'event' 
    ? 'Chat with Host' 
    : conversation.context?.type === 'marketplace'
    ? 'Chat with Seller'
    : `Chat with ${otherParticipant?.userName}`;

  if (isMinimized) {
    return (
      <div 
        className="w-80 bg-white border border-[#e5e7eb] rounded-t-lg shadow-lg overflow-hidden transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-4"
        style={{ boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)' }}
      >
        <div
          className="flex items-center justify-between p-3 border-b border-[#e5e7eb] cursor-pointer hover:bg-[#f9fafb] transition-colors"
          onClick={onMinimize}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: getAvatarColor(otherParticipant?.userId || '') }}>
              {otherParticipant?.userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[#111] truncate">{otherParticipant?.userName}</div>
              {conversation.context && (
                <div className="text-xs text-[#666] truncate">
                  Re: {conversation.context.itemTitle}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMinimize?.();
              }}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="Maximize"
            >
              <Maximize2 size={16} className="text-[#666]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              aria-label="Close"
            >
              <X size={16} className="text-[#666]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-80 bg-white border border-[#e5e7eb] rounded-t-lg shadow-lg flex flex-col overflow-hidden transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-4"
      style={{ 
        height: '420px',
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] bg-white shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: getAvatarColor(otherParticipant?.userId || '') }}>
            {otherParticipant?.userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[#111] truncate">{chatTitle}</div>
            {conversation.context && (
              <div className="text-xs text-[#666] truncate">
                Re: {conversation.context.itemTitle}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              aria-label="Minimize"
            >
              <Minimize2 size={16} className="text-[#666]" />
            </button>
          )}
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close"
          >
            <X size={16} className="text-[#666]" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3 bg-white">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[#666] text-sm mb-1">No messages yet</p>
              <p className="text-xs text-[#999]">Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.senderId === currentUser.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                >
                  <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {message.imageUrl && (
                      <ImageWithFallback
                        src={message.imageUrl}
                        alt="Shared image"
                        className="rounded-lg max-w-full h-auto"
                      />
                    )}
                    {message.content && (
                      <div
                        className={`px-3 py-2 rounded-2xl shadow-sm ${
                          isOwn
                            ? 'bg-[#0b5fff] text-white'
                            : 'bg-[#f3f4f6] text-[#111]'
                        }`}
                      >
                        <p className="text-sm break-words leading-relaxed">{message.content}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-[#999] px-1">
                      <span>{formatTime(message.timestamp)}</span>
                      {isOwn && message.read && <span>· Read</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Image Preview */}
      {imagePreview && (
        <div className="px-4 py-2 border-t border-[#e5e7eb] bg-white shrink-0">
          <div className="relative inline-block">
            <ImageWithFallback
              src={imagePreview}
              alt="Preview"
              className="h-16 rounded-lg"
            />
            <button
              onClick={() => setImagePreview(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
              aria-label="Remove image"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#e5e7eb] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0b5fff] focus:border-transparent transition-shadow"
          />
          <Button
            onClick={handleSend}
            disabled={!messageText.trim() && !imagePreview}
            size="icon"
            className="shrink-0 bg-[#0b5fff] hover:bg-[#0949cc] text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg w-9 h-9 transition-colors"
            aria-label="Send message"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};
