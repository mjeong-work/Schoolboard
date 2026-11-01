import { useState } from 'react';
import { Heart, MessageCircle, Send, MoreHorizontal, BadgeCheck } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useData, type Post } from '../utils/dataContext';
import { useAuth } from '../utils/authContext';
import { useChat } from '../utils/chatContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { toast } from 'sonner@2.0.3';
import { EditPostDialog } from './EditPostDialog';
import { CommentsSheet } from './CommentsSheet';

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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isLiked = isPostLiked(post.id);
  const isOwnPost = user?.id === post.authorId;
  const isAdmin = user?.role === 'Administrator';

  const handleLike = async () => {
    try {
      await toggleLikePost(post.id);
    } catch {
      toast.error("Couldn't update like. Please try again.");
    }
  };

  const handleAddComment = async (text: string) => {
    try {
      await addCommentToPost(post.id, text);
      toast.success('Comment added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
      throw err; // lets CommentsPanel keep the draft instead of clearing it
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
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deletePost(post.id);
      toast.success('Post deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete post');
    } finally {
      setIsDeleting(false);
    }
  };

  // Errors propagate to EditPostDialog, which shows them and stays open
  // with the user's edits intact instead of closing as if it had saved.
  const handleEditPost = async (updates: { title: string; content: string; image: string | null; category: string }) => {
    await updatePost(post.id, updates);
    toast.success('Post updated');
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
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-black/5 rounded-full transition-colors" aria-label="Post options">
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
                      disabled={isDeleting}
                      onClick={() => setIsDeleteConfirmOpen(true)}
                    >
                      Delete post
                    </DropdownMenuItem>
                  )}
                  {/* Reporting is specced but not built yet — say so rather than
                      silently doing nothing (see Week 1 reporting spec). */}
                  <DropdownMenuItem className="cursor-pointer" onClick={() => toast("Reporting isn't available yet.")}>Report post</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => toast("Sharing isn't available yet.")}>Share post</DropdownMenuItem>
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
        </div>
      </div>

      <CommentsSheet
        open={isCommentsOpen}
        onOpenChange={setIsCommentsOpen}
        comments={post.comments}
        currentUserId={user?.id}
        currentUserName={user?.name}
        isAdmin={isAdmin}
        onAddComment={handleAddComment}
        onDeleteComment={handleDeleteComment}
      />

      <ConfirmDeleteDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete this post?"
        onConfirm={handleDeletePost}
      />

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