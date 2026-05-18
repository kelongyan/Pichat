import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { Header } from '../components/Header';
import { ImageCard } from '../components/ImageCard';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { useConversationStore } from '../lib/store';
import { getImageURL, revokeAll } from '../lib/imageStore';
import type { GalleryImage } from '../types';

const PAGE_SIZE = 20;

export default function Gallery() {
  const navigate = useNavigate();
  const { open: openLightbox } = useLightbox();
  const { show: showToast } = useToast();
  const getImagePage = useConversationStore((s) => s.getImagePage);

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const loadTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getImagePage(null, PAGE_SIZE).then(({ images: page, nextCursor }) => {
      if (cancelled) return;
      cursorRef.current = nextCursor;
      setImages(page);
      setHasMore(nextCursor !== null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [getImagePage]);

  useEffect(() => {
    return () => { revokeAll(); };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    try {
      const { images: page, nextCursor } = await getImagePage(cursorRef.current, PAGE_SIZE);
      cursorRef.current = nextCursor;
      setImages((prev) => [...prev, ...page]);
      setHasMore(nextCursor !== null);
    } finally {
      loadingRef.current = false;
    }
  }, [getImagePage, hasMore]);

  useEffect(() => {
    if (!loadTriggerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(loadTriggerRef.current);
    return () => observer.disconnect();
  }, [loadMore, images.length]);

  const handleEdit = useCallback((src: string) => {
    navigate('/chat', { state: { images: [src] } });
    showToast('Reference image attached');
  }, [navigate, showToast]);

  const handleFullscreen = useCallback((img: GalleryImage) => {
    if (img.imageId) {
      getImageURL(img.imageId).then((url) => {
        if (url) openLightbox(url, { prompt: img.prompt });
      });
    } else if (img.imageBase64) {
      openLightbox(`data:image/png;base64,${img.imageBase64}`, { prompt: img.prompt });
    }
  }, [openLightbox]);

  return (
    <>
      <Header activeTab="gallery" />
      {loaded && images.length === 0 && (
        <div className="landing fade-in">
          <div style={{ color: 'var(--text-muted)', fontSize: 48, marginBottom: 16 }}>
            <ImageIcon size={48} strokeWidth={1} />
          </div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>No images yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Create your first image to see it here
          </p>
        </div>
      )}
      {images.length > 0 && (
        <div className="gallery-grid fade-in">
          {images.map((img, i) => (
            <ImageCard
              key={img.imageId || i}
              imageId={img.imageId}
              imageBase64={img.imageBase64}
              size={img.size}
              prompt={img.prompt}
              timestamp={img.timestamp}
              useThumbnail
              onEdit={handleEdit}
              onFullscreen={() => handleFullscreen(img)}
            />
          ))}
          {hasMore && (
            <div ref={loadTriggerRef} style={{ height: 1 }} />
          )}
        </div>
      )}
    </>
  );
}
