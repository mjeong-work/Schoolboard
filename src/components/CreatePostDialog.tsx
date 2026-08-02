import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog@1.1.6';
import { X, Clock, Image as ImageIcon, Calendar as CalendarIcon, MoreHorizontal, ChevronDown } from 'lucide-react';
import { getAvatarColor } from '../utils/anonymousName';
import { useAuth } from '../utils/authContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner@2.0.3';

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (post: {
    title: string;
    category: string;
    content: string;
    image?: string;
  }) => void;
}

// The "Anyone" pill in the header is a restyled version of the existing
// post category — same field, same values sent to onSubmit, just presented
// as an audience selector instead of a labeled dropdown field.
const AUDIENCE_OPTIONS = [
  { value: 'all-school', label: 'Anyone' },
  { value: 'current-students', label: 'Current Students' },
  { value: 'alumni', label: 'Alumni' },
];

const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB

export function CreatePostDialog({ open, onOpenChange, onSubmit }: CreatePostDialogProps) {
  const { user } = useAuth();
  const [audience, setAudience] = useState('all-school');
  const [content, setContent] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setAudience('all-school');
    setContent('');
    setUploadedImage(null);
  };

  const closeAndReset = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = () => {
    if (!content.trim()) return;
    // No dedicated title field anymore — the post IS the content, matching
    // how the backend's required "title" column was always redundant with
    // content for this style of post. PostCard only renders a separate
    // title line when it differs from the content, so this stays invisible.
    onSubmit({
      title: content.trim(),
      category: audience,
      content: content.trim(),
      image: uploadedImage || undefined,
    });
    closeAndReset(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`Image must be under 1 MB (selected file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setUploadedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const audienceLabel = AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? 'Anyone';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={closeAndReset}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            textareaRef.current?.focus();
          }}
          className="fixed inset-0 z-50 bg-white flex flex-col outline-none font-[Roboto] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Title className="sr-only">Create post</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Share a post with the Campus Connect community</DialogPrimitive.Description>

          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#f0f0f0] shrink-0">
            <DialogPrimitive.Close asChild>
              <button className="p-2 hover:bg-black/5 rounded-full transition-colors" aria-label="Close">
                <X className="w-5 h-5 text-[#111]" />
              </button>
            </DialogPrimitive.Close>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                    style={{ background: getAvatarColor(user?.id || '') }}
                  >
                    {user?.name?.charAt(0) || 'A'}
                  </div>
                  <span className="text-sm font-semibold text-[#111]">{audienceLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#666]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {AUDIENCE_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => setAudience(opt.value)}>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toast("Scheduling posts isn't available yet.")}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
                aria-label="Schedule post"
              >
                <Clock className="w-5 h-5 text-[#666]" />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!content.trim()}
                className="bg-black text-white rounded-full px-4 h-8 text-sm font-semibold disabled:bg-[#e5e7eb] disabled:text-[#999] transition-colors"
              >
                Post
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share your thoughts..."
              className="w-full min-h-[140px] resize-none outline-none border-none text-xl text-[#111] placeholder:text-[#999] bg-transparent"
            />

            {uploadedImage && (
              <div className="relative rounded-2xl overflow-hidden border border-[#f0f0f0] mt-2">
                <img
                  src={uploadedImage}
                  alt="Upload preview"
                  className="w-full h-auto max-h-[400px] object-cover"
                />
                <button
                  type="button"
                  onClick={() => setUploadedImage(null)}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className="border-t border-[#f0f0f0] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-1 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              aria-label="Add photo"
            >
              <ImageIcon className="w-5 h-5 text-[#0b5fff]" />
            </button>
            <button
              type="button"
              onClick={() => toast("Scheduling posts isn't available yet.")}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              aria-label="Schedule"
            >
              <CalendarIcon className="w-5 h-5 text-[#0b5fff]" />
            </button>
            <button
              type="button"
              onClick={() => toast('No additional options yet.')}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="w-5 h-5 text-[#0b5fff]" />
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
