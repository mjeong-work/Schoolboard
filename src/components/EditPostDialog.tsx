import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Upload, X } from 'lucide-react';
import type { Post } from '../utils/dataContext';

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
  onSubmit: (updates: { title: string; content: string; image: string | null; category: string }) => Promise<void>;
}

export function EditPostDialog({ open, onOpenChange, post, onSubmit }: EditPostDialogProps) {
  const [title, setTitle] = useState(post.title);
  const [category, setCategory] = useState(post.category);
  const [content, setContent] = useState(post.content);
  const [image, setImage] = useState<string | null>(post.image);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      await onSubmit({ title: title.trim(), content: content.trim(), image, category });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`Image must be under 1 MB (selected file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="font-[Roboto]">
          <DialogTitle className="text-[#111]">Edit Post</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 font-[Roboto]">
          <div>
            <Label htmlFor="edit-post-title" className="text-[#666] mb-1.5 block">Post Title *</Label>
            <Input
              id="edit-post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a descriptive title..."
              className="border-[#e5e7eb] rounded-lg"
              required
            />
          </div>

          <div>
            <Label htmlFor="edit-post-category" className="text-[#666] mb-1.5 block">Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="border-[#e5e7eb] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-students">Current Students</SelectItem>
                <SelectItem value="alumni">Alumni</SelectItem>
                <SelectItem value="all-school">All School</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="edit-post-content" className="text-[#666] mb-1.5 block">Post Content *</Label>
            <Textarea
              id="edit-post-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="border-[#e5e7eb] rounded-lg min-h-[120px]"
              required
            />
          </div>

          <div>
            <Label className="text-[#666] mb-1.5 block">Photo (Optional)</Label>
            {!image ? (
              <div className="border-2 border-dashed border-[#e5e7eb] rounded-lg p-5 text-center hover:border-[#0b5fff] transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="edit-image-upload"
                />
                <label htmlFor="edit-image-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[rgba(67,68,68,0.1)] flex items-center justify-center">
                      <Upload className="w-5 h-5 text-[#0b5fff]" />
                    </div>
                    <div className="text-sm text-[#666]">Click to upload an image</div>
                    <div className="text-xs text-[#999]">PNG, JPG, GIF up to 1MB</div>
                  </div>
                </label>
              </div>
            ) : (
              <div className="relative border border-[#e5e7eb] rounded-lg overflow-hidden">
                <img
                  src={image}
                  alt="Preview"
                  className="w-full h-auto max-h-[250px] object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#f9fafb] transition-colors"
                >
                  <X className="w-4 h-4 text-[#666]" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-3">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="bg-white border border-[#e5e7eb] text-[#111] hover:bg-[#f9fafb] px-6 py-2 rounded-lg w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !content.trim() || isSaving}
              className="bg-[rgb(0,0,0)] hover:bg-[#0949cc] text-white px-6 py-2 rounded-lg shadow-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
