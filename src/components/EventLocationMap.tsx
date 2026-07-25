import { useRef, useEffect } from 'react';
import { useGoogleMaps } from '../utils/useGoogleMaps';

interface Props {
  lat: number;
  lng: number;
  locationName?: string;
  locationAddress?: string;
  radiusMeters?: number;
}

export function EventLocationMap({
  lat,
  lng,
  locationName,
  locationAddress,
  radiusMeters = 300,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loaded, error } = useGoogleMaps();

  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    const center = { lat, lng };

    const map = new (window as any).google.maps.Map(containerRef.current, {
      center,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    new (window as any).google.maps.Marker({
      position: center,
      map,
      title: locationName || locationAddress || 'Event location',
    });

    new (window as any).google.maps.Circle({
      center,
      radius: radiusMeters,
      map,
      strokeColor: '#0b5fff',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#0b5fff',
      fillOpacity: 0.1,
    });
  }, [loaded, lat, lng, radiusMeters]);

  // On error, render nothing — venue text is already displayed above the map.
  if (error) return null;

  return (
    <div className="mt-3">
      {!loaded ? (
        <div className="h-44 rounded-xl bg-[#f0f0f0] animate-pulse" />
      ) : (
        <>
          <div
            ref={containerRef}
            className="h-44 w-full rounded-xl overflow-hidden border border-[#f0f0f0]"
          />
          <p className="text-xs text-[#999] mt-1.5 text-center">
            Event location radius: {radiusMeters}m
          </p>
        </>
      )}
    </div>
  );
}
