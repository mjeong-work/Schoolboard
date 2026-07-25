import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { getAvatarColor } from '../utils/anonymousName';
import { X, Send, Image as ImageIcon } from 'lucide-react';
import { useChat } from '../utils/chatContext';
import { useAuth } from '../utils/authContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface ChatDialogProps {
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ChatDialog: React.FC<ChatDialogProps> = ({
  conversationId,
  open,
  onOpenChange,
}) => {
  const { currentUser } = useAuth();
  const { getConversation, getConversationMessages, sendMessage, markAsRead } = useChat();
  const [messageText, setMessageText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conversation = conversationId ? getConversation(conversationId) : null;
  const messages = conversationId ? getConversationMessages(conversationId) : [];

  // Get the other participant's name
  const otherParticipant = conversation?.participants.find(
    (p) => p.userId !== currentUser?.id
  );

  useEffect(() => {
    // Mark messages as read when chat is opened
    if (open && conversationId) {
      markAsRead(conversationId);
    }
  }, [conversationId, open, markAsRead]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = () => {
    if (!conversationId) return;
    
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

  if (!conversation || !currentUser) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] max-h-[700px] flex flex-col p-0" aria-describedby="chat-description">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-[#e5e5e5] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: getAvatarColor(otherParticipant?.userId || '') }}>
              {otherParticipant?.userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-[#111] text-left">
                {otherParticipant?.userName}
              </DialogTitle>
              <DialogDescription id="chat-description" className="sr-only">
                Chat conversation with {otherParticipant?.userName}
                {conversation.context && ` regarding ${conversation.context.itemTitle}`}
              </DialogDescription>
              {conversation.context && (
                <p className="text-sm text-[#666]">
                  Re: {conversation.context.itemTitle}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#666] mb-2">No messages yet</p>
                <p className="text-sm text-[#999]">Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isOwn = message.senderId === currentUser.id;
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      {message.imageUrl && (
                        <ImageWithFallback
                          src={message.imageUrl}
                          alt="Shared image"
                          className="rounded-lg max-w-full h-auto"
                        />
                      )}
                      {message.content && (
                        <div
                          className={`px-4 py-2 rounded-lg ${
                            isOwn
                              ? 'bg-[#0b5fff] text-white'
                              : 'bg-gray-100 text-[#111]'
                          }`}
                        >
                          <p className="text-sm break-words">{message.content}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-[#666] px-1">
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
          <div className="px-6 py-3 border-t border-[#e5e5e5] shrink-0">
            <div className="relative inline-block">
              <ImageWithFallback
                src={imagePreview}
                alt="Preview"
                className="h-20 rounded"
              />
              <button
                onClick={() => setImagePreview(null)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t border-[#e5e5e5] shrink-0">
          <div className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0"
            >
              <ImageIcon size={20} className="text-[#666]" />
            </Button>
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 border-[#e5e7eb] rounded-lg"
            />
            <Button
              onClick={handleSend}
              disabled={!messageText.trim() && !imagePreview}
              size="icon"
              className="shrink-0 bg-[#0b5fff] hover:bg-[#0949cc] disabled:opacity-50"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};