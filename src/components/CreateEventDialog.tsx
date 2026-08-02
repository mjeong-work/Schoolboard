import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog@1.1.6';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Camera, X } from 'lucide-react';
import { LocationAutocomplete, type LocationData } from './LocationAutocomplete';
import { toast } from 'sonner@2.0.3';

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

const EVENT_FORMAT_OPTIONS = ['Academic', 'Social', 'Career', 'Sports', 'Other'];
const DESCRIPTION_MAX_LENGTH = 5000;
const ONLINE_VENUE = 'Online';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: {
    title: string;
    date: string;
    time: string;
    venue: string;
    description: string;
    image?: string;
    category?: string;
    locationName?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    googlePlaceId?: string;
  }) => void;
}

const EMPTY_LOCATION: LocationData = { displayText: '' };

export function CreateEventDialog({ open, onOpenChange, onSubmit }: CreateEventDialogProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [eventType, setEventType] = useState<'in-person' | 'online'>('in-person');
  const [locationData, setLocationData] = useState<LocationData>(EMPTY_LOCATION);
  const [eventFormat, setEventFormat] = useState('Academic');
  const [description, setDescription] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setDate('');
    setTime('');
    setEventType('in-person');
    setLocationData(EMPTY_LOCATION);
    setEventFormat('Academic');
    setDescription('');
    setUploadedImage(null);
  };

  const closeAndReset = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  // When the event is online there's no venue to search for — the existing
  // Event schema still requires a non-empty venue string, so this fills it
  // in silently rather than adding a new "online" field to the backend.
  const venue = eventType === 'online' ? ONLINE_VENUE : locationData.displayText.trim();
  const isSubmitDisabled = !title.trim() || !date || !time || !venue || !description.trim();

  const handleSubmit = () => {
    if (isSubmitDisabled) return;

    onSubmit({
      title: title.trim(),
      date,
      time,
      venue,
      description: description.trim(),
      image: uploadedImage || undefined,
      category: eventFormat,
      locationName: eventType === 'in-person' ? locationData.locationName : undefined,
      locationAddress: eventType === 'in-person' ? locationData.locationAddress : undefined,
      locationLat: eventType === 'in-person' ? locationData.locationLat : undefined,
      locationLng: eventType === 'in-person' ? locationData.locationLng : undefined,
      googlePlaceId: eventType === 'in-person' ? locationData.googlePlaceId : undefined,
    });

    closeAndReset(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setUploadedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const fieldClass = 'border-[#e5e7eb] bg-white rounded-md';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={closeAndReset}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 bg-white flex flex-col outline-none font-[Roboto] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <DialogPrimitive.Title className="sr-only">Create event</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Share an event with the Campus Connect community</DialogPrimitive.Description>

          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#f0f0f0] shrink-0">
            <DialogPrimitive.Close asChild>
              <button className="p-2 hover:bg-black/5 rounded-full transition-colors" aria-label="Close">
                <X className="w-5 h-5 text-[#111]" />
              </button>
            </DialogPrimitive.Close>
            <span className="font-semibold text-[#111]">Create event</span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="bg-black text-white rounded-full px-4 h-8 text-sm font-semibold disabled:bg-[#e5e7eb] disabled:text-[#999] transition-colors"
            >
              Done
            </button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto">
            {/* Cover image */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full h-40 sm:h-48 shrink-0 overflow-hidden block"
              style={!uploadedImage ? { background: 'linear-gradient(135deg, #0b5fff 0%, #6366f1 100%)' } : undefined}
            >
              {uploadedImage && (
                <img src={uploadedImage} alt="Event cover" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/10 hover:bg-black/20 transition-colors">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-[#111]" />
                </div>
                <span className="text-xs font-medium text-white drop-shadow">
                  {uploadedImage ? 'Change cover image' : 'Add cover image'}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </button>

            <div className="p-4 space-y-5">
              {/* Event name */}
              <div>
                <Label htmlFor="event-title" className="text-[#666] mb-1.5 block">
                  Event name *
                </Label>
                <Input
                  id="event-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter event name..."
                  className={fieldClass}
                  required
                />
              </div>

              {/* Event type */}
              <div>
                <Label className="text-[#666] mb-2 block">Event type</Label>
                <RadioGroup
                  value={eventType}
                  onValueChange={(value) => setEventType(value as 'in-person' | 'online')}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="in-person" id="event-type-in-person" />
                    <Label htmlFor="event-type-in-person" className="cursor-pointer font-normal">In person</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="online" id="event-type-online" />
                    <Label htmlFor="event-type-online" className="cursor-pointer font-normal">Online</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Event format */}
              <div>
                <Label htmlFor="event-format" className="text-[#666] mb-1.5 block">
                  Event format
                </Label>
                <Select value={eventFormat} onValueChange={setEventFormat}>
                  <SelectTrigger id="event-format" className={fieldClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date and time */}
              <div>
                <Label className="text-[#666] mb-1.5 block">Date and time *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    id="event-date"
                    type="date"
                    value={date}
                    min={new Date().toLocaleDateString('en-CA')}
                    onChange={(e) => setDate(e.target.value)}
                    className={fieldClass}
                    required
                  />
                  <Select value={time} onValueChange={setTime}>
                    <SelectTrigger id="event-time" className={fieldClass}>
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

              {/* Venue — only for in-person events */}
              {eventType === 'in-person' && (
                <div>
                  <Label htmlFor="event-venue" className="text-[#666] mb-1.5 block">
                    Venue *
                  </Label>
                  <LocationAutocomplete
                    id="event-venue"
                    value={locationData}
                    onChange={setLocationData}
                    placeholder="Search for a venue or address..."
                    required
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <Label htmlFor="event-description" className="text-[#666] mb-1.5 block">
                  Description *
                </Label>
                <Textarea
                  id="event-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  placeholder="Ex: topics, schedule, etc."
                  className={`${fieldClass} min-h-[120px]`}
                  required
                />
                <div className="text-xs text-[#999] text-right mt-1">
                  {description.length.toLocaleString()}/{DESCRIPTION_MAX_LENGTH.toLocaleString()}
                </div>
              </div>

              <p className="text-xs text-[#999] pt-2 pb-4">
                By continuing, you agree with the Campus Connect{' '}
                <span
                  className="underline cursor-pointer hover:text-[#666]"
                  onClick={() => toast('Event policies are coming soon.')}
                >
                  Event Policies
                </span>
                .
              </p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
