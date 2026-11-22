import { useEffect, useRef, useState } from 'react';
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
import { Camera, Loader2, X } from 'lucide-react';
import { MARKETPLACE_CATEGORIES } from '../utils/marketplaceCategories';
import { uploadImage, validateImageFile, ImageUploadError } from '../utils/imageUpload';
import { useBackableOverlay } from '../utils/useBackableOverlay';
import { useAuth } from '../utils/authContext';
import { toast } from 'sonner@2.0.3';
import { useIsMobile } from './ui/use-mobile';
import { LocationAutocomplete, type LocationData } from './LocationAutocomplete';
import type { MarketplaceItem } from '../utils/dataContext';

interface ListingFormData {
  title: string;
  category: string;
  price: number;
  condition: string;
  description: string;
  images: string[];
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  googlePlaceId?: string;
}

const EMPTY_LOCATION: LocationData = { displayText: '' };

interface CreateMarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (listing: ListingFormData) => Promise<void>;
  /** When set, the dialog opens pre-filled to edit this listing instead of creating a new one. */
  editItem?: MarketplaceItem | null;
  onSubmitEdit?: (itemId: string, listing: ListingFormData) => Promise<void>;
}

const CONDITION_OPTIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor'];
const DESCRIPTION_MAX_LENGTH = 1000;
const TITLE_MAX_LENGTH = 100;
// Sanity ceiling so a typo (or a pasted number) can't publish a listing
// priced in the billions and break the card layout.
const PRICE_MAX = 1_000_000;
// The thumbnail on the card only ever shows images[0] — the first photo
// added here becomes the cover. The rest are only visible in the expanded
// detail view.
const MAX_IMAGES = 6;

type ImageSlot =
  | { id: string; kind: 'existing'; url: string }
  | { id: string; kind: 'new'; file: File; previewUrl: string };

function makeId() {
  return Math.random().toString(36).slice(2);
}

export function CreateMarketplaceDialog({ open, onOpenChange, onSubmit, editItem, onSubmitEdit }: CreateMarketplaceDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const isEditMode = !!editItem;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [description, setDescription] = useState('');
  const [locationData, setLocationData] = useState<LocationData>(EMPTY_LOCATION);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokeNewPreviews = (slots: ImageSlot[]) => {
    slots.forEach((slot) => {
      if (slot.kind === 'new') URL.revokeObjectURL(slot.previewUrl);
    });
  };

  const resetForm = () => {
    setTitle('');
    setCategory('');
    setPrice('');
    setCondition('');
    setDescription('');
    setLocationData(EMPTY_LOCATION);
    setImageSlots((prev) => {
      revokeNewPreviews(prev);
      return [];
    });
  };

  // Pre-fill (edit mode) or clear (create mode) whenever the dialog opens.
  // editItem's identity is only ever a snapshot taken at the moment "Edit"
  // was clicked, so a background refetch of the listing (e.g. someone
  // else's comment) can't overwrite in-progress edits here.
  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setTitle(editItem.title);
      setCategory(editItem.category);
      setPrice(String(editItem.price));
      setCondition(editItem.condition);
      setDescription(editItem.description);
      setLocationData(
        editItem.locationLat !== undefined && editItem.locationLng !== undefined
          ? {
              displayText: editItem.locationName || editItem.locationAddress || '',
              locationName: editItem.locationName,
              locationAddress: editItem.locationAddress,
              locationLat: editItem.locationLat,
              locationLng: editItem.locationLng,
              googlePlaceId: editItem.googlePlaceId,
            }
          : EMPTY_LOCATION
      );
      setImageSlots(editItem.images.map((url) => ({ id: makeId(), kind: 'existing', url })));
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Release any pending local preview URLs on unmount.
  useEffect(() => {
    return () => revokeNewPreviews(imageSlots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The desktop card floats over the page rather than covering it, so the
  // page underneath needs an explicit scroll lock while open (mobile's
  // full-screen composer already covers the viewport, but locking here too
  // is harmless and keeps behavior consistent).
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Lets the device/browser back action close this the same way an X
  // click would, instead of leaving Marketplace entirely.
  // Routed through closeAndReset so a back gesture mid-upload is ignored the
  // same way the X button is.
  useBackableOverlay(open, () => closeAndReset(false));

  const closeAndReset = (next: boolean) => {
    if (submitting) return; // don't let a mid-upload close lose track of the outcome
    if (!next) resetForm();
    onOpenChange(next);
  };

  const priceNum = parseFloat(price);
  const isPriceValid = price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0 && priceNum <= PRICE_MAX;
  const isSubmitDisabled = !title.trim() || !category || !isPriceValid || !condition || !description.trim() || submitting;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file(s) later
    if (!files.length) return;

    const remaining = MAX_IMAGES - imageSlots.length;
    if (remaining <= 0) {
      toast(`You can add up to ${MAX_IMAGES} photos.`);
      return;
    }

    const candidates = files.slice(0, remaining);
    if (files.length > remaining) {
      toast(`Only added the first ${remaining} photo${remaining === 1 ? '' : 's'} — ${MAX_IMAGES} max.`);
    }

    const accepted: ImageSlot[] = [];
    for (const file of candidates) {
      try {
        validateImageFile(file, 'marketplace');
      } catch (err) {
        toast.error(err instanceof ImageUploadError ? err.message : `"${file.name}" couldn't be used — skipped.`);
        continue;
      }
      accepted.push({ id: makeId(), kind: 'new', file, previewUrl: URL.createObjectURL(file) });
    }
    if (accepted.length) setImageSlots((prev) => [...prev, ...accepted]);
  };

  const removeImage = (id: string) => {
    setImageSlots((prev) => {
      const target = prev.find((slot) => slot.id === id);
      if (target?.kind === 'new') URL.revokeObjectURL(target.previewUrl);
      return prev.filter((slot) => slot.id !== id);
    });
  };

  // Existing (already-hosted) images pass through untouched — never
  // re-uploaded — so editing a listing without touching its photos costs
  // no extra network requests. Newly picked files are compressed and
  // uploaded to Storage here, at submit time, so nothing is written until
  // the user actually confirms.
  //
  // Each photo that uploads successfully is converted to an 'existing' slot
  // right away, so if a later photo (or the save itself) fails, retrying
  // doesn't upload the earlier ones again and leave orphaned copies.
  const resolveImages = async (): Promise<string[]> => {
    if (!user) throw new Error('Not authenticated');
    const slots = [...imageSlots];
    try {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.kind === 'existing') continue;
        const url = await uploadImage(slot.file, 'marketplace', user.id);
        URL.revokeObjectURL(slot.previewUrl);
        slots[i] = { id: slot.id, kind: 'existing', url };
      }
    } finally {
      setImageSlots(slots);
    }
    return slots.map((slot) => (slot.kind === 'existing' ? slot.url : ''));
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;
    setSubmitting(true);
    try {
      const images = await resolveImages();
      const payload: ListingFormData = {
        title: title.trim(),
        category,
        price: priceNum,
        condition,
        description: description.trim(),
        images,
        locationName: locationData.locationName,
        locationAddress: locationData.locationAddress,
        locationLat: locationData.locationLat,
        locationLng: locationData.locationLng,
        googlePlaceId: locationData.googlePlaceId,
      };
      if (isEditMode && editItem) {
        await onSubmitEdit?.(editItem.id, payload);
      } else {
        await onSubmit(payload);
      }
      // Only clear the form / close once the save actually succeeded —
      // on failure the user's input (and photos) stay exactly as they
      // left them so nothing has to be re-entered.
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'border-[#e5e7eb] bg-white rounded-md';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={closeAndReset}>
      <DialogPrimitive.Portal>
        {/* Mobile keeps the plain dim overlay behind the full-screen composer.
            Desktop dims + blurs the Marketplace page behind the centered card. */}
        <DialogPrimitive.Overlay
          className={
            isMobile
              ? 'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
              : 'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          }
        />
        <DialogPrimitive.Content
          onInteractOutside={(e) => { if (submitting) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (submitting) e.preventDefault(); }}
          className={
            isMobile
              ? 'fixed inset-0 z-50 bg-white flex flex-col outline-none font-[Roboto] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
              : 'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[calc(100%-2rem)] sm:max-w-[560px] max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col outline-none font-[Roboto] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          }
        >
          <DialogPrimitive.Title className="sr-only">{isEditMode ? 'Edit Listing' : 'Create Listing'}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {isEditMode ? 'Update your marketplace listing' : 'List an item for sale to the Campus Connect community'}
          </DialogPrimitive.Description>

          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#f0f0f0] shrink-0">
            <button
              type="button"
              onClick={() => closeAndReset(false)}
              disabled={submitting}
              className="p-2 hover:bg-black/5 rounded-full transition-colors disabled:opacity-30"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-[#111]" />
            </button>
            <span className="font-semibold text-[#111]">{isEditMode ? 'Edit Listing' : 'Create Listing'}</span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="bg-black text-white rounded-full px-4 h-8 text-sm font-semibold disabled:bg-[#e5e7eb] disabled:text-[#999] transition-colors flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? (isEditMode ? 'Saving…' : 'Posting…') : (isEditMode ? 'Save' : 'Post')}
            </button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto">
            {/* Photo upload — multiple photos; the first one becomes the
                cover shown on the card thumbnail, the rest only show up in
                the expanded detail view. */}
            <div className="border-b border-[#f0f0f0] p-4">
              <Label className="text-[#666] mb-2 block">
                Photos {imageSlots.length > 0 && `(${imageSlots.length}/${MAX_IMAGES})`}
              </Label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imageSlots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-[#e5e7eb] bg-[#f5f5f5]"
                  >
                    <img
                      src={slot.kind === 'existing' ? slot.url : slot.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(slot.id)}
                      disabled={submitting}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {imageSlots.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    className="shrink-0 w-24 h-24 rounded-lg border border-dashed border-[#e5e7eb] flex flex-col items-center justify-center gap-1 hover:bg-[#fafafa] transition-colors disabled:opacity-30"
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
              accept="image/jpeg,image/png,image/webp,image/gif"
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
                  maxLength={TITLE_MAX_LENGTH}
                  placeholder="e.g., MacBook Pro 13 inch 2020"
                  className={fieldClass}
                  disabled={submitting}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="listing-category" className="text-[#666] mb-1.5 block">
                  Category *
                </Label>
                <Select value={category} onValueChange={setCategory} disabled={submitting} required>
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
                    disabled={submitting}
                    required
                  />
                </div>
                {price.trim() !== '' && !isPriceValid && (
                  <p className="text-xs text-red-600 mt-1">
                    Enter a price between $0 and ${PRICE_MAX.toLocaleString('en-US')}.
                  </p>
                )}
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
                      disabled={submitting}
                      className={`px-3.5 h-8 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 ${
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

              {/* Meetup location — optional, real Google Places pick. Not
                  required: plenty of listings are handled purely over chat. */}
              <div>
                <Label htmlFor="listing-location" className="text-[#666] mb-1.5 block">
                  Meetup Location (optional)
                </Label>
                <LocationAutocomplete
                  id="listing-location"
                  value={locationData}
                  onChange={setLocationData}
                  placeholder="Search for a campus spot to meet..."
                />
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
                  disabled={submitting}
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
