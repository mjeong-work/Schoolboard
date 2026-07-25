import { useState } from 'react';
import { Heart, MessageCircle, Send, MoreHorizontal, BadgeCheck } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Collapsible, CollapsibleContent } from './ui/collapsible';
import { Input } from './ui/input';
import { useData, type Post } from '../utils/dataContext';
import { useAuth } from '../utils/authContext';
import { useChat } from '../utils/chatContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner@2.0.3';
import { EditPostDialog } from './EditPostDialog';

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { user } = useAuth();
  const {
    toggleLikePost,
    addCommentToPost,
    deleteCommentFromPost,
    deletePost,
    updatePost,
    isPostLiked
  } = useData();
  const { getOrCreateConversation } = useChat();

  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isLiked = isPostLiked(post.id);
  const isOwnPost = user?.id === post.authorId;
  const isAdmin = user?.role === 'Administrator';

  const handleLike = () => {
    toggleLikePost(post.id);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      await addCommentToPost(post.id, commentText);
      setCommentText('');
      toast.success('Comment added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteCommentFromPost(post.id, commentId);
      toast.success('Comment deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete comment');
    }
  };

  const handleDeletePost = async () => {
    try {
      await deletePost(post.id);
      toast.success('Post deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete post');
    }
  };

  const handleEditPost = async (updates: { title: string; content: string; image: string | null; category: string }) => {
    try {
      await updatePost(post.id, updates);
      toast.success('Post updated');
    } catch {
      toast.error('Failed to update post');
    }
  };

  const handleStartChat = async () => {
    if (!user || isOwnPost) return;
    try {
      await getOrCreateConversation(post.authorId, post.author);
      window.location.hash = '#messages';
    } catch (err: any) {
      toast.error(err?.message || 'Could not start conversation. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="border-b border-[#f0f0f0] px-4 py-4 hover:bg-[#fafafa] transition-colors">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium font-[Roboto]" style={{ background: getAvatarColor(post.authorId) }}>
            {post.author.charAt(0)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[15px] text-[rgb(51,51,51)] font-[Roboto]">{post.author}</span>
              {post.verified && (
                <BadgeCheck className="w-4 h-4 text-blue-500" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#999] text-sm font-[Roboto]">{formatDate(post.date)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-black/5 rounded-full transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-[#999]" strokeWidth={2} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {(isOwnPost || isAdmin) && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setIsEditOpen(true)}
                    >
                      Edit post
                    </DropdownMenuItem>
                  )}
                  {(isOwnPost || isAdmin) && (
                    <DropdownMenuItem
                      className="cursor-pointer text-red-600 focus:text-red-600"
                      onClick={handleDeletePost}
                    >
                      Delete post
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="cursor-pointer">Report post</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">Share post</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Post Title - if exists */}
          {post.title && post.title !== post.content && (
            <h3 className="text-[15px] text-[rgb(51,51,51)] mb-1 leading-snug font-[Roboto]">{post.title}</h3>
          )}

          {/* Post Content */}
          <p className="text-[14px] text-[rgb(51,51,51)] leading-relaxed mb-3 font-[Roboto]">{post.content}</p>

          {/* Image */}
          {post.image && (
            <div className="mb-3 rounded-xl overflow-hidden border border-[#f0f0f0]">
              <ImageWithFallback
                src={post.image}
                alt={post.title}
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {/* Action Buttons */}
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
              <span className="text-sm text-[#999]">{post.likes.length}</span>
            </button>

            <button 
              onClick={() => setIsCommentsOpen(!isCommentsOpen)}
              className="flex items-center gap-1.5 p-2 hover:bg-black/5 rounded-full transition-colors group"
            >
              <MessageCircle 
                className="w-5 h-5 text-black/60 group-hover:text-blue-500 transition-colors" 
                strokeWidth={1.5}
              />
              <span className="text-sm text-[#999]">{post.comments.length}</span>
            </button>

            {!isOwnPost && (
              <button
                onClick={handleStartChat}
                className="flex items-center gap-1.5 p-2 hover:bg-black/5 rounded-full transition-colors group"
              >
                <Send
                  className="w-5 h-5 text-black/60 group-hover:text-blue-500 transition-colors"
                  strokeWidth={1.5}
                />
              </button>
            )}
          </div>

          {/* Comments Section */}
          <Collapsible open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
            <CollapsibleContent className="mt-4 space-y-3">
              {/* Add Comment Input */}
              <div className="flex gap-2 pt-3 border-t border-[#f0f0f0]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 font-[Roboto]" style={{ background: getAvatarColor(user?.id || '') }}>
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="flex-1 flex gap-2">
                  <Input
                    type="text"
                    placeholder="Reply..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddComment();
                      }
                    }}
                    className="flex-1 border-[#f0f0f0] rounded-full px-4 h-8 text-sm placeholder:text-[#999] focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:border-black/20 font-[Roboto]"
                  />
                  <Button
                    onClick={handleAddComment}
                    size="icon"
                    disabled={!commentText.trim()}
                    className="bg-black hover:bg-black/80 text-white rounded-full h-8 w-8 disabled:opacity-30"
                  >
                    <Send className="w-3.5 h-3.5" strokeWidth={2} />
                  </Button>
                </div>
              </div>

              {/* Comments List */}
              {post.comments.length > 0 && (
                <div className="space-y-3 pl-2">
                  {post.comments.map((comment) => {
                    const isOwnComment = user?.id === comment.authorId;
                    return (
                      <div key={comment.id} className="flex gap-2 mt-[0px] mr-[0px] mb-[12px] ml-[-8px]">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 font-[Roboto] m-[0px] mx-[0px] my-[3px]" style={{ background: getAvatarColor(comment.authorId) }}>
                          {comment.author.charAt(0)}
                        </div>
                        
                        <div className="flex-1 min-w-0 px-[6px] py-[0px]">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-[rgb(51,51,51)] font-[Roboto]">{comment.author}</span>
                            <span className="text-xs text-[#999]">{formatDate(comment.date)}</span>
                            {(isOwnComment || isAdmin) && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-xs text-[#999] hover:text-red-500 transition-colors ml-auto"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-[rgb(51,51,51)] leading-relaxed font-[Roboto]">{comment.text}</p>
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
      {isEditOpen && (
        <EditPostDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          post={post}
          onSubmit={handleEditPost}
        />
      )}
    </div>
  );
}