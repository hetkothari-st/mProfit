import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { propertyPhotosApi } from '@/api/propertyMedia.api';

/**
 * An object URL for a property photo. The bytes are fetched with the user's
 * token and cached by react-query (a photo never changes for its id); the URL
 * is made per component and revoked when it unmounts.
 */
export function usePhotoUrl(photoId: string | null | undefined, size: 'full' | 'thumb'): string | null {
  const { data: blob } = useQuery({
    queryKey: ['property-photo', photoId, size],
    queryFn: () => propertyPhotosApi.image(photoId!, size),
    enabled: !!photoId,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
