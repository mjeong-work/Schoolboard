import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog@1.1.6';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Camera, X } from 'lucide-react';
import { MARKETPLACE_CATEGORIES } from '../utils/marketplaceCategories';
import { toast } from 'sonner@2.0.3';

interface CreateMarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (listing: {
    title: string;
    category: string;
    price: number;
    condition: string;
    description: string;
    images: string[];
  }) => void;
}

const CONDITION_OPTIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor'];
const DESCRIPTION_MAX_LENGTH = 1000;
// The thumbnail on the card only ever shows images[0] — the first photo
// added here becomes the cover. The rest are only visible in the expanded
// detail view.
const MAX_IMAGES = 6;

export function CreateMarketplaceDialog({ open, onOpenChange, onSubmit }: CreateMarketplaceDialogProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setCategory('');
    setPrice('');
    setCondition('');
    setDescription('');
    setImages([]);
  };

  const closeAndReset = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const isSubmitDisabled = !title.trim() || !category || !price || !condition || !description.trim();

  const handleSubmit = () => {
    if (isSubmitDisabled) return;

    onSubmit({
      title: title.trim(),
      category,
      price: parseFloat(price),
      condition,
      description: description.trim(),
      images,
    });

    closeAndReset(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file(s) later
    if (!files.length) return;

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast(`You can add up to ${MAX_IMAGES} photos.`);
      return;
    }
    if (files.length > remaining) {
      toast(`Only added the first ${remaining} photo${remaining === 1 ? '' : 's'} — ${MAX_IMAGES} max.`);
    }

    files.slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => setImages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const fieldClass = 'border-[#e5e7eb] bg-white rounded-md';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={closeAndReset}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 bg-white flex flex-col outline-none font-[Roboto] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <DialogPrimitive.Title className="sr-only">Create Listing</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">List an item for sale to the Campus Connect community</DialogPrimitive.Description>

          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#f0f0f0] shrink-0">
            <DialogPrimitive.Close asChild>
              <button className="p-2 hover:bg-black/5 rounded-full transition-colors" aria-label="Close">
                <X className="w-5 h-5 text-[#111]" />
              </button>
            </DialogPrimitive.Close>
            <span className="font-semibold text-[#111]">Create Listing</span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="bg-black text-white rounded-full px-4 h-8 text-sm font-semibold disabled:bg-[#e5e7eb] disabled:text-[#999] transition-colors"
            >
              Post
            </button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto">
            {/* Photo upload — multiple photos; the first one becomes the
                cover shown on the card thumbnail, the rest only show up in
                the expanded detail view. */}
            <div className="border-b border-[#f0f0f0] p-4">
              <Label className="text-[#666] mb-2 block">
                Photos {images.length > 0 && `(${images.length}/${MAX_IMAGES})`}
              </Label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, index) => (
                  <div
                    key={index}
                    className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-[#e5e7eb] bg-[#f5f5f5]"
                  >
                    <img src={img} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                    {index === 0 && (
                      <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 w-24 h-24 rounded-lg border border-dashed border-[#e5e7eb] flex flex-col items-center justify-center gap-1 hover:bg-[#fafafa] transition-colors"
                  >
                    <Camera className="w-5 h-5 text-[#666]" />
                    <span className="text-[11px] text-[#666]">Add photo</span>
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            <div className="p-4 space-y-5">
              {/* Item Title */}
              <div>
                <Label htmlFor="listing-title" className="text-[#666] mb-1.5 block">
                  Item Title *
                </Label>
                <Input
                  id="listing-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., MacBook Pro 13 inch 2020"
                  className={fieldClass}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="listing-category" className="text-[#666] mb-1.5 block">
                  Category *
                </Label>
                <Select value={category} onValueChange={setCategory} required>
                  <SelectTrigger id="listing-category" className={fieldClass}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETPLACE_CATEGORIES.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Price */}
              <div>
                <Label htmlFor="listing-price" className="text-[#666] mb-1.5 block">
                  Price *
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-sm pointer-events-none">$</span>
                  <Input
                    id="listing-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className={`${fieldClass} pl-6`}
                    required
                  />
                </div>
              </div>

              {/* Condition */}
              <div>
                <Label className="text-[#666] mb-1.5 block">Condition *</Label>
                <div className="flex flex-wrap gap-2">
                  {CONDITION_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCondition(opt)}
                      className={`px-3.5 h-8 rounded-full text-sm font-medium border transition-colors ${
                        condition === opt
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-[#111] border-[#e5e7eb] hover:bg-[#f9fafb]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="listing-description" className="text-[#666] mb-1.5 block">
                  Description *
                </Label>
                <Textarea
                  id="listing-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  placeholder="Describe your item..."
                  className={`${fieldClass} min-h-[120px]`}
                  required
                />
                <div className="text-xs text-[#999] text-right mt-1">
                  {description.length}/{DESCRIPTION_MAX_LENGTH}
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
