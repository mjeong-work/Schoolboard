import { useState, useEffect } from 'react';

declare global {
  interface Window {
    google?: any;
    initGoogleMapsCallback?: () => void;
  }
}

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Module-level singletons ensure the script is only injected once across all instances.
let _status: LoadStatus = 'idle';
const _subscribers = new Set<(s: LoadStatus) => void>();

function broadcast(next: LoadStatus) {
  _status = next;
  _subscribers.forEach(fn => fn(next));
}

export function useGoogleMaps() {
  const [status, setStatus] = useState<LoadStatus>(() =>
    window.google?.maps?.places ? 'loaded' : _status
  );

  useEffect(() => {
    if (window.google?.maps?.places) {
      setStatus('loaded');
      return;
    }

    _subscribers.add(setStatus);

    if (_status === 'idle') {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
      if (!apiKey) {
        broadcast('error');
      } else {
        broadcast('loading');
        window.initGoogleMapsCallback = () => broadcast('loaded');
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMapsCallback&loading=async`;
        script.async = true;
        script.onerror = () => broadcast('error');
        document.head.appendChild(script);
      }
    }

    return () => { _subscribers.delete(setStatus); };
  }, []);

  return {
    loaded: status === 'loaded',
    loading: status === 'loading',
    error: status === 'error',
  };
}
