import { useRef, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { useGoogleMaps } from '../utils/useGoogleMaps';

export interface LocationData {
  displayText: string;
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  googlePlaceId?: string;
}

interface Props {
  value: LocationData;
  onChange: (data: LocationData) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Search for a venue or address...',
  id,
  required,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<any>(null);
  // Keep a ref to always call the latest onChange without re-registering the listener.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const { loaded, error } = useGoogleMaps();

  useEffect(() => {
    if (!loaded || !inputRef.current || acRef.current) return;

    const ac = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      fields: ['name', 'formatted_address', 'place_id', 'geometry'],
    });
    acRef.current = ac;

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      const lat: number | undefined = place.geometry?.location?.lat?.();
      const lng: number | undefined = place.geometry?.location?.lng?.();
      const displayText =
        place.name || place.formatted_address || inputRef.current?.value || '';

      onChangeRef.current({
        displayText,
        locationName: place.name || undefined,
        locationAddress: place.formatted_address || undefined,
        locationLat: lat,
        locationLng: lng,
        googlePlaceId: place.place_id || undefined,
      });
    });

    return () => {
      if (acRef.current && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(acRef.current);
      }
      acRef.current = null;
    };
  }, [loaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Manual typing clears structured location data; user must re-select from suggestions.
    onChange({ displayText: e.target.value });
  };

  const hasCoords =
    value.locationLat !== undefined && value.locationLng !== undefined;

  return (
    <div>
      <div className="relative">
        <MapPin
          className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
            hasCoords ? 'text-[#0b5fff]' : 'text-[#999]'
          }`}
          strokeWidth={2}
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value.displayText}
          onChange={handleChange}
          placeholder={
            error
              ? 'Enter venue name or address...'
              : loaded
              ? placeholder
              : 'Loading map search...'
          }
          className="w-full pl-9 pr-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0b5fff] focus:border-[#0b5fff] bg-white"
          required={required}
          autoComplete="off"
        />
      </div>
      {hasCoords && (
        <p className="text-xs text-[#0b5fff] mt-1">✓ Map location saved</p>
      )}
    </div>
  );
}
