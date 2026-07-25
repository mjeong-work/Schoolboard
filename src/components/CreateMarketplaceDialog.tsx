import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Upload, X } from 'lucide-react';

interface CreateMarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (listing: {
    title: string;
    category: string;
    price: number;
    condition: string;
    description: string;
    image?: string;
  }) => void;
}

export function CreateMarketplaceDialog({ open, onOpenChange, onSubmit }: CreateMarketplaceDialogProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !category || !price || !condition || !description.trim()) {
      return;
    }

    const newListing = {
      title: title.trim(),
      category,
      price: parseFloat(price),
      condition,
      description: description.trim(),
      image: uploadedImage || undefined
    };

    onSubmit(newListing);
    
    // Reset form
    setTitle('');
    setCategory('');
    setPrice('');
    setCondition('');
    setDescription('');

    setUploadedImage(null);
    onOpenChange(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setUploadedImage(null);
  };

  const handleCancel = () => {
    setTitle('');
    setCategory('');
    setPrice('');
    setCondition('');
    setDescription('');

    setUploadedImage(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#111]">Create Marketplace Listing</DialogTitle>
          <DialogDescription className="text-[#666]">
            List an item for sale to the Campus Connect community
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label htmlFor="listing-title" className="text-[#666] mb-1.5 block">
              Item Title *
            </Label>
            <Input
              id="listing-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., MacBook Pro 13 inch 2020"
              className="border-[#e5e7eb] rounded-lg"
              required
            />
          </div>

          {/* Category and Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="listing-category" className="text-[#666] mb-1.5 block">
                Category *
              </Label>
              <Select value={category} onValueChange={setCategory} required>
                <SelectTrigger className="border-[#e5e7eb] rounded-lg">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Textbooks">Textbooks</SelectItem>
                  <SelectItem value="Electronics">Electronics</SelectItem>
                  <SelectItem value="Furniture">Furniture</SelectItem>
                  <SelectItem value="Appliances">Appliances</SelectItem>
                  <SelectItem value="Sports & Outdoors">Sports & Outdoors</SelectItem>
                  <SelectItem value="School Supplies">School Supplies</SelectItem>
                  <SelectItem value="Musical Instruments">Musical Instruments</SelectItem>
                  <SelectItem value="Clothing">Clothing</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="listing-price" className="text-[#666] mb-1.5 block">
                Price ($) *
              </Label>
              <Input
                id="listing-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="border-[#e5e7eb] rounded-lg"
                required
              />
            </div>
          </div>

          {/* Condition */}
          <div>
            <Label htmlFor="listing-condition" className="text-[#666] mb-1.5 block">
              Condition *
            </Label>
            <Select value={condition} onValueChange={setCondition} required>
              <SelectTrigger className="border-[#e5e7eb] rounded-lg">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Like New">Like New</SelectItem>
                <SelectItem value="Good">Good</SelectItem>
                <SelectItem value="Fair">Fair</SelectItem>
                <SelectItem value="Poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="listing-description" className="text-[#666] mb-1.5 block">
              Description *
            </Label>
            <Textarea
              id="listing-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your item in detail..."
              className="border-[#e5e7eb] rounded-lg min-h-[120px]"
              required
            />
          </div>

          {/* Image Upload */}
          <div>
            <Label className="text-[#666] mb-1.5 block">
              Item Photo (Optional)
            </Label>
            
            {!uploadedImage ? (
              <div className="border-2 border-dashed border-[#e5e7eb] rounded-lg p-5 text-center hover:border-[#0b5fff] transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="listing-image-upload"
                />
                <label htmlFor="listing-image-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center">
                      <Upload className="w-5 h-5 text-[#0b5fff]" />
                    </div>
                    <div className="text-sm text-[#666]">
                      Click to upload an image
                    </div>
                    <div className="text-xs text-[#999]">
                      PNG, JPG, GIF up to 10MB
                    </div>
                  </div>
                </label>
              </div>
            ) : (
              <div className="relative border border-[#e5e7eb] rounded-lg overflow-hidden">
                <img 
                  src={uploadedImage} 
                  alt="Upload preview" 
                  className="w-full h-auto max-h-[250px] object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#f9fafb] transition-colors"
                >
                  <X className="w-4 h-4 text-[#666]" />
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-3">
            <Button
              type="button"
              onClick={handleCancel}
              className="bg-white border border-[#e5e7eb] text-[#111] hover:bg-[#f9fafb] px-6 py-2 rounded-lg w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !category || !price || !condition || !description.trim()}
              className="bg-[#0b5fff] hover:bg-[#0949cc] text-white px-6 py-2 rounded-lg shadow-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Listing
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}