import { useState, useEffect } from 'react';
import { getImageURL, getThumbURL } from '../lib/imageStore';

/**
 * Lazily loads an image URL from IndexedDB by imageId.
 * @param imageId - The blob ID to load
 * @param useThumbnail - If true, loads the thumbnail instead of full image
 * @returns The object URL string (empty if not loaded or invalid)
 */
export function useLazyImage(imageId?: string, useThumbnail = false): string {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!imageId) {
      setSrc('');
      return;
    }

    let cancelled = false;
    const loadUrl = useThumbnail ? getThumbURL : getImageURL;

    loadUrl(imageId).then((url) => {
      if (!cancelled && url) {
        setSrc(url);
      }
    }).catch(() => {
      // IndexedDB read failure — leave src empty
    });

    return () => {
      cancelled = true;
    };
  }, [imageId, useThumbnail]);

  return src;
}
