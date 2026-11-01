import { useRef } from 'react';
import { toast } from 'sonner@2.0.3';
import { useData, type MarketplaceItem } from './dataContext';
import { useAuth } from './authContext';
import { useChat } from './chatContext';

/**
 * Save/contact/delete/comment handlers for a single marketplace listing.
 * Shared by the compact feed card, the desktop inline-expanded post, and
 * the mobile full-page detail view so the three surfaces never drift out
 * of sync with each other.
 */
export function useMarketplaceItemActions(item: MarketplaceItem) {
  const { user } = useAuth();
  const {
    toggleSaveItem,
    deleteMarketplaceItem,
    isItemSaved,
    addCommentToMarketplaceItem,
    deleteCommentFromMarketplaceItem,
  } = useData();
  const { getOrCreateConversation, getConversationCountForItem } = useChat();

  const isSaved = isItemSaved(item.id);
  const isOwnItem = user?.id === item.seller.id;
  const isAdmin = user?.role === 'Administrator';
  const conversationCount = getConversationCountForItem(item.id, 'marketplace');
  const deletingRef = useRef(false);

  const handleSave = async () => {
    try {
      await toggleSaveItem(item.id);
      toast.success(isSaved ? 'Item unsaved' : 'Item saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update save');
    }
  };

  const handleContactSeller = async () => {
    if (!user || isOwnItem) return;
    try {
      const conversationId = await getOrCreateConversation(
        item.seller.id,
        item.seller.name,
        { type: 'marketplace', itemId: item.id, itemTitle: item.title }
      );
      if (!conversationId) {
        toast.error('Could not start conversation. Please try again.');
        return;
      }
      window.dispatchEvent(new CustomEvent('openChat', { detail: { conversationId } }));
    } catch (err: any) {
      console.error('[handleContactSeller]', err);
      toast.error(err?.message || 'Failed to start conversation. Please try again.');
    }
  };

  // Returns whether the delete actually succeeded, so callers that need
  // to react to the outcome (e.g. navigate back only on success) don't
  // have to guess from a toast alone.
  const handleDeleteItem = async (): Promise<boolean> => {
    if (deletingRef.current) return false; // a repeat tap would just get "Delete rejected"
    deletingRef.current = true;
    try {
      await deleteMarketplaceItem(item.id);
      toast.success('Item deleted');
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete item');
      return false;
    } finally {
      deletingRef.current = false;
    }
  };

  const handleAddComment = async (text: string) => {
    try {
      await addCommentToMarketplaceItem(item.id, text);
      toast.success('Comment added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
      throw err; // lets CommentsPanel keep the draft instead of clearing it
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteCommentFromMarketplaceItem(item.id, commentId);
      toast.success('Comment deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete comment');
    }
  };

  return {
    user,
    isSaved,
    isOwnItem,
    isAdmin,
    conversationCount,
    handleSave,
    handleContactSeller,
    handleDeleteItem,
    handleAddComment,
    handleDeleteComment,
  };
}
