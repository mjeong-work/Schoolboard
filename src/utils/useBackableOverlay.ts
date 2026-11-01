import { useEffect, useRef } from 'react';

let nextOverlayId = 1;

/**
 * Makes the device/browser "back" action close an overlay (full-page
 * detail view, modal) instead of leaving the page entirely.
 *
 * While `isOpen`, pushes one extra history entry with the same URL. A
 * back gesture/button pops that entry — which fires `popstate` — and we
 * treat that as "close the overlay" instead of letting the app navigate
 * away out from under it. If the overlay is closed some other way (X
 * button, outside click, successful submit), the pushed entry is
 * consumed on cleanup so it doesn't leave a dead stop in history.
 *
 * Overlays can stack (e.g. the edit-listing dialog opened from the mobile
 * listing detail page). Each entry is tagged with its overlay's id, and a
 * popstate that lands back on an overlay's *own* entry means only an
 * overlay above it was popped — so it stays open. Without this, closing
 * the top dialog also closed the page underneath it.
 */
export function useBackableOverlay(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const overlayId = nextOverlayId++;
    window.history.pushState({ overlay: true, overlayId }, '');
    pushedRef.current = true;

    const handlePopState = () => {
      if (window.history.state?.overlayId === overlayId) return; // an overlay above this one closed
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
    // Only re-run when the overlay opens/closes, not on every onClose identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
