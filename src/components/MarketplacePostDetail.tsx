import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi } from './ui/carousel';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { EventLocationMap } from './EventLocationMap';
import { useData, type MarketplaceItem } from '../utils/dataContext';

/**
 * Shared pieces of the "full" post presentation — the photo gallery and
 * the untruncated title/price/condition/seller/description block. Used by
 * both the desktop inline-expanded post (MarketplaceCard) and the mobile
 * full-page detail view (MarketplacePostDetailPage), so neither has its
 * own copy of this markup.
 */

interface MarketplacePostGalleryProps {
  images: string[];
  title: string;
  /** Edge-to-edge on the mobile full page; rounded to match the card on desktop. */
  roundedClassName?: string;
  heightClassName?: string;
}

export function MarketplacePostGallery({
  images,
  title,
  roundedClassName = 'rounded-xl',
  heightClassName = 'h-56 sm:h-64',
}: MarketplacePostGalleryProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrentSlide(carouselApi.selectedScrollSnap());
    onSelect();
    carouselApi.on('select', onSelect);
    return () => { carouselApi.off('select', onSelect); };
  }, [carouselApi]);

  if (images.length === 0) {
    return (
      <div className={`w-full ${heightClassName} ${roundedClassName} flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100`}>
        <span className="text-4xl font-bold text-[#6366f1]">{title.charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${heightClassName} ${roundedClassName} overflow-hidden bg-[#f5f5f5]`}>
      <Carousel setApi={setCarouselApi} className="w-full h-full">
        <CarouselContent className="-ml-0 h-full">
          {images.map((img, index) => (
            <CarouselItem key={index} className="pl-0 h-full">
              <ImageWithFallback
                src={img}
                alt={`${title} — photo ${index + 1} of ${images.length}`}
                className="w-full h-full object-cover"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        {images.length > 1 && (
          <>
            {/* Desktop mouse users have no swipe gesture — without these,
                the only way to reach photo 2+ is an undiscoverable
                click-and-drag, so make prev/next explicit buttons. Must
                stay inside <Carousel> — these read carousel context. */}
            <CarouselPrevious className="left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 border-none text-white size-7 [&_svg]:size-4" />
            <CarouselNext className="right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 border-none text-white size-7 [&_svg]:size-4" />
          </>
        )}
      </Carousel>
      {images.length > 1 && (
        <>
          <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded-full pointer-events-none">
            {currentSlide + 1} / {images.length}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
            {images.map((_, index) => (
              <span
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  index === currentSlide ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// "$12.5" -> "$12.50", "$1200" -> "$1,200"; whole-dollar prices stay
// without cents so the common case reads the same as before.
export function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function MarketplacePostBody({ item }: { item: MarketplaceItem }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-base font-semibold text-black font-[Roboto]">{item.title}</h2>
        <span className="text-base font-bold text-black font-[Roboto] shrink-0">{formatPrice(item.price)}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs text-[#666]">
        <span className="px-1.5 py-0.5 rounded-full bg-gray-100">{item.condition}</span>
        <span className="text-[#bbb]">·</span>
        <span>{item.category}</span>
      </div>

      <div className="flex items-center gap-1 mb-3 text-sm text-[#666]">
        <span>{item.seller.name}</span>
      </div>

      <p className="text-sm text-[#111] leading-relaxed whitespace-pre-wrap">
        {item.description}
      </p>

      {/* Real seller-picked meetup spot (Google Places) — only rendered
          when one actually exists, never a fabricated placeholder. */}
      {item.locationLat !== undefined && item.locationLng !== undefined && (
        <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
          <div className="flex items-center gap-1.5 text-sm text-[#111]">
            <MapPin className="w-4 h-4 text-[#6366f1] shrink-0" strokeWidth={2} />
            <span className="font-medium">{item.locationName || item.locationAddress}</span>
          </div>
          {item.locationName && item.locationAddress && (
            <p className="text-xs text-[#999] mt-0.5 ml-[22px]">{item.locationAddress}</p>
          )}
          <EventLocationMap
            lat={item.locationLat}
            lng={item.locationLng}
            locationName={item.locationName}
            locationAddress={item.locationAddress}
            radiusMeters={item.locationRadiusMeters ?? 150}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Opening the full detail (mobile full page, or expanding the post on
 * desktop) is what counts as a genuine "view" of the listing — dedupe by
 * session the same way the old MarketplaceDetailSheet did, just keyed off
 * whichever surface is actually showing the full detail now.
 */
export function useMarketplaceItemView(itemId: string, active: boolean) {
  const { incrementItemViews } = useData();

  useEffect(() => {
    if (!active) return;
    const key = `viewed_item_${itemId}`;
    if (!sessionStorage.getItem(key)) {
      incrementItemViews(itemId);
      sessionStorage.setItem(key, 'true');
    }
  }, [active, itemId, incrementItemViews]);
}
