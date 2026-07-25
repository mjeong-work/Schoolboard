import { useState } from 'react';
import { Heart, MessageCircle, Calendar, Clock, MapPin, Users, CheckCircle, Send, MoreHorizontal, UserPlus } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Collapsible, CollapsibleContent } from './ui/collapsible';
import { useData, type Event } from '../utils/dataContext';
import { useAuth } from '../utils/authContext';
import { useChat } from '../utils/chatContext';
import { toast } from 'sonner@2.0.3';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { EventLocationMap } from './EventLocationMap';
import { EditEventDialog } from './EditEventDialog';

interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  const { user } = useAuth();
  const {
    toggleLikeEvent,
    addCommentToEvent,
    toggleRSVPEvent,
    deleteEvent,
    updateEvent,
    isEventLiked,
    hasRSVPed: hasUserRSVPed
  } = useData();
  const { getOrCreateConversation } = useChat();
  
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isLiked = isEventLiked(event.id);
  const hasRSVPed = hasUserRSVPed(event.id);
  const isOwnEvent = user?.id === event.authorId;
  const isAdmin = user?.role === 'Administrator';

  const handleLike = () => {
    toggleLikeEvent(event.id);
  };

  const handleRSVP = () => {
    toggleRSVPEvent(event.id);
    if (!hasRSVPed) {
      toast.success('RSVP confirmed!');
    } else {
      toast.success('RSVP cancelled');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    addCommentToEvent(event.id, newComment);
    setNewComment('');
    toast.success('Comment added');
  };

  const handleCommentKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  };

  const handleDeleteEvent = () => {
    deleteEvent(event.id);
    toast.success('Event deleted');
  };

  const handleContactHost = async () => {
    if (!user || isOwnEvent) return;
    try {
      const conversationId = await getOrCreateConversation(
        event.authorId,
        event.author,
        { type: 'event', itemId: event.id, itemTitle: event.title }
      );
      if (!conversationId) {
        toast.error('Could not start conversation. Please try again.');
        return;
      }
      window.dispatchEvent(new CustomEvent('openChat', { detail: { conversationId } }));
    } catch (err: any) {
      console.error('[handleContactHost]', err);
      toast.error(err?.message || 'Failed to start conversation. Please try again.');
    }
  };

  return (
    <>
    <div className="border-b border-[#f0f0f0] px-4 py-4 hover:bg-[#fafafa] transition-colors">
      <div className="flex gap-3">
        {/* Avatar/Icon */}
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm" style={{ background: getAvatarColor(event.authorId) }}>
            <Calendar className="w-5 h-5" strokeWidth={2} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px] text-black font-[Roboto]">{event.author || 'Campus Events'}</span>
              {hasRSVPed && (
                <div className="flex items-center gap-1 text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3 fill-blue-500" strokeWidth={2} />
                  <span>Going</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#999] text-sm font-[Roboto]">{formatDate(event.date)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-black/5 rounded-full transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-[#999]" strokeWidth={2} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isOwnEvent && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setIsEditOpen(true)}
                    >
                      Edit event
                    </DropdownMenuItem>
                  )}
                  {(isOwnEvent || isAdmin) && (
                    <DropdownMenuItem
                      className="cursor-pointer text-red-600 focus:text-red-600"
                      onClick={handleDeleteEvent}
                    >
                      Delete event
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="cursor-pointer">Report event</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">Save event</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">Share event</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Event Title */}
          <h3 className="text-[15px] text-[rgb(51,51,51)] mb-2 leading-snug font-[Roboto]">{event.title}</h3>

          {/* Event Details - Compact */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#666] mb-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{event.time}</span>
            </div>
            <span className="text-[#ddd]">•</span>
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{event.venue}</span>
            </div>
            <span className="text-[#ddd]">•</span>
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{event.participants.length} going</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-[14px] text-[rgb(51,51,51)] leading-relaxed mb-3 font-[Roboto]">{event.description}</p>

          {/* Image */}
          {event.image && (
            <div className="mb-3 rounded-xl overflow-hidden border border-[#f0f0f0]">
              <ImageWithFallback
                src={event.image}
                alt={event.title}
                className="w-full h-auto object-cover max-h-[400px]"
              />
            </div>
          )}

          {/* Map (shown when the event has GPS coordinates) */}
          {event.locationLat !== undefined && event.locationLng !== undefined && (
            <div className="mb-3">
              <EventLocationMap
                lat={event.locationLat}
                lng={event.locationLng}
                locationName={event.locationName}
                locationAddress={event.locationAddress}
                radiusMeters={event.locationRadiusMeters ?? 300}
              />
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex items-center gap-1 mb-3">
            {/* RSVP Button */}
            <button
              onClick={handleRSVP}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                hasRSVPed
                  ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  : 'bg-black text-white hover:bg-black/80'
              }`}
            >
              <UserPlus className="w-4 h-4" strokeWidth={2} />
              {hasRSVPed ? 'Going' : 'RSVP'}
            </button>

            {/* Contact Host - Only if not own event */}
            {!isOwnEvent && (
              <button
                onClick={handleContactHost}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-black hover:bg-gray-200 transition-colors font-[Roboto]"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={2} />
                Message
              </button>
            )}
          </div>

          {/* Interaction Bar */}
          <div className="flex items-center gap-1 -ml-2">
            <button
              onClick={handleLike}
              className="flex items-center gap-1.5 p-2 hover:bg-black/5 rounded-full transition-colors group"
            >
              <Heart 
                className={`w-5 h-5 transition-colors ${
                  isLiked ? 'fill-red-500 text-red-500' : 'text-black/60 group-hover:text-red-500'
                }`}
                strokeWidth={1.5}
              />
              <span className="text-sm text-[#999]">{event.likes.length}</span>
            </button>

            <button 
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1.5 p-2 hover:bg-black/5 rounded-full transition-colors group"
            >
              <MessageCircle 
                className="w-5 h-5 text-black/60 group-hover:text-blue-500 transition-colors" 
                strokeWidth={1.5}
              />
              <span className="text-sm text-[#999]">{event.comments.length}</span>
            </button>
          </div>

          {/* Comments Section */}
          <Collapsible open={showComments} onOpenChange={setShowComments}>
            <CollapsibleContent className="mt-4 space-y-3">
              {/* Add Comment Input */}
              <div className="flex gap-2 pt-3 border-t border-[#f0f0f0]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0" style={{ background: getAvatarColor(user?.id || '') }}>
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="flex-1 flex gap-2">
                  <Input
                    type="text"
                    placeholder="Reply..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddComment();
                      }
                    }}
                    className="flex-1 border-[#f0f0f0] rounded-full px-4 h-8 text-sm placeholder:text-[#999] focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:border-black/20"
                  />
                  <Button
                    onClick={handleAddComment}
                    size="icon"
                    disabled={!newComment.trim()}
                    className="bg-black hover:bg-black/80 text-white rounded-full h-8 w-8 disabled:opacity-30"
                  >
                    <Send className="w-3.5 h-3.5" strokeWidth={2} />
                  </Button>
                </div>
              </div>

              {/* Comments List */}
              {event.comments.length > 0 && (
                <div className="space-y-3 pl-2">
                  {event.comments.map((comment) => {
                    const isOwnComment = user?.id === comment.authorId;
                    return (
                      <div key={comment.id} className="flex gap-2 mt-[0px] mr-[0px] mb-[12px] ml-[-8px]">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 mx-[0px] my-[3px]" style={{ background: getAvatarColor(comment.authorId) }}>
                          {comment.author.charAt(0)}
                        </div>
                        
                        <div className="flex-1 min-w-0 mx-[6px] my-[0px]">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-black">{comment.author}</span>
                            <span className="text-xs text-[#999]">{formatDate(comment.date)}</span>
                            {(isOwnComment || isAdmin) && (
                              <button
                                onClick={() => {
                                  // Add delete comment functionality if needed
                                  toast.success('Comment deleted');
                                }}
                                className="text-xs text-[#999] hover:text-red-500 transition-colors ml-auto"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-black leading-relaxed">{comment.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>

    {/* Edit event dialog — only rendered when the author opens it */}
    {isEditOpen && (
      <EditEventDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        event={event}
        onSubmit={async (updates) => {
          try {
            await updateEvent(event.id, updates);
            setIsEditOpen(false);
            toast.success('Event updated!');
          } catch (err: any) {
            toast.error(err?.message || 'Failed to update event');
          }
        }}
      />
    )}
    </>
  );
}