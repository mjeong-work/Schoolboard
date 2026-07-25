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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Upload, X } from 'lucide-react';
import { LocationAutocomplete, type LocationData } from './LocationAutocomplete';
import type { Event } from '../utils/dataContext';

const TIME_SLOTS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
  '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM',
  '8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM',
  '10:00 PM',
];

interface EditEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  onSubmit: (updates: {
    title: string;
    date: string;
    time: string;
    venue: string;
    description: string;
    image?: string | null;
    category?: string;
    locationName?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    googlePlaceId?: string;
  }) => void;
}

export function EditEventDialog({ open, onOpenChange, event, onSubmit }: EditEventDialogProps) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [time, setTime] = useState(event.time);
  const [category, setCategory] = useState(event.category || 'Academic');
  const [description, setDescription] = useState(event.description);
  const [uploadedImage, setUploadedImage] = useState<string | null>(event.image || null);
  const [locationData, setLocationData] = useState<LocationData>({
    // Prefer structured location name; fall back to plain venue text
    displayText: event.locationName || event.venue,
    locationName: event.locationName,
    locationAddress: event.locationAddress,
    locationLat: event.locationLat,
    locationLng: event.locationLng,
    googlePlaceId: event.googlePlaceId,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !date || !time || !locationData.displayText.trim() || !description.trim()) {
      return;
    }

    onSubmit({
      title: title.trim(),
      date,
      time,
      venue: locationData.displayText.trim(),
      description: description.trim(),
      image: uploadedImage,
      category,
      locationName: locationData.locationName,
      locationAddress: locationData.locationAddress,
      locationLat: locationData.locationLat,
      locationLng: locationData.locationLng,
      googlePlaceId: locationData.googlePlaceId,
    });
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

  const isSubmitDisabled =
    !title.trim() || !date || !time || !locationData.displayText.trim() || !description.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#111]">Edit Event</DialogTitle>
          <DialogDescription className="text-[#666]">
            Update your event details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label htmlFor="edit-event-title" className="text-[#666] mb-1.5 block">
              Event Title *
            </Label>
            <Input
              id="edit-event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter event title..."
              className="border-[#e5e7eb] rounded-lg"
              required
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-event-date" className="text-[#666] mb-1.5 block">
                Date *
              </Label>
              <Input
                id="edit-event-date"
                type="date"
                value={date}
                min={new Date().toLocaleDateString('en-CA')}
                onChange={(e) => setDate(e.target.value)}
                className="border-[#e5e7eb] rounded-lg"
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-event-time" className="text-[#666] mb-1.5 block">
                Time *
              </Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger id="edit-event-time" className="border-[#e5e7eb] rounded-lg">
                  <SelectValue placeholder="Select a time..." />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Venue with Google Maps Autocomplete */}
          <div>
            <Label htmlFor="edit-event-venue" className="text-[#666] mb-1.5 block">
              Venue *
            </Label>
            <LocationAutocomplete
              id="edit-event-venue"
              value={locationData}
              onChange={setLocationData}
              placeholder="Search for a venue or address..."
              required
            />
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="edit-event-category" className="text-[#666] mb-1.5 block">
              Category
            </Label>
            <Input
              id="edit-event-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Academic, Social, Career, Sports"
              className="border-[#e5e7eb] rounded-lg"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="edit-event-description" className="text-[#666] mb-1.5 block">
              Event Description *
            </Label>
            <Textarea
              id="edit-event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your event..."
              className="border-[#e5e7eb] rounded-lg min-h-[120px]"
              required
            />
          </div>

          {/* Image Upload */}
          <div>
            <Label className="text-[#666] mb-1.5 block">
              Event Photo (Optional)
            </Label>

            {!uploadedImage ? (
              <div className="border-2 border-dashed border-[#e5e7eb] rounded-lg p-5 text-center hover:border-[#0b5fff] transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="edit-event-image-upload"
                />
                <label htmlFor="edit-event-image-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center">
                      <Upload className="w-5 h-5 text-[#0b5fff]" />
                    </div>
                    <div className="text-sm text-[#666]">Click to upload an image</div>
                    <div className="text-xs text-[#999]">PNG, JPG, GIF up to 10MB</div>
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
                  onClick={() => setUploadedImage(null)}
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
              onClick={() => onOpenChange(false)}
              className="bg-white border border-[#e5e7eb] text-[#111] hover:bg-[#f9fafb] px-6 py-2 rounded-lg w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              className="bg-[#0b5fff] hover:bg-[#0949cc] text-white px-6 py-2 rounded-lg shadow-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
