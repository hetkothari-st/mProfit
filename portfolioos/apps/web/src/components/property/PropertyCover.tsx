import { useState } from 'react';
import { usePhotoUrl } from './usePhotoUrl';

/** A property's cover photo filling its box — for list cards and map popups. */
export function PropertyCover({ photoId, className = '' }: { photoId: string; className?: string }) {
  const url = usePhotoUrl(photoId, 'thumb');
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-muted ${className}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
      {url && (
        <img
          src={url}
          alt=""
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
