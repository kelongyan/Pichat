import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { Header } from '../components/Header';
import { ImageCard } from '../components/ImageCard';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { useConversationStore } from '../lib/store';
import { getImageURL } from '../lib/imageStore';
import type { GalleryImage } from '../types';

const PAGE_SIZE = 20;

export default function Gallery() {
  const navigate = useNavigate();
  const { open: openLightbox } = useLightbox();
  const { show: showToast } = useToast();
  const getAllImages = useConversationStore((s) => s.getAllImages);

  const [allImages, setAllImages] = useState<GalleryImage[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAllImages().then((list) => {
      if (!cancelled) setAllImages(list);
    });
    return () => { cancelled = true; };
  }, [getAllImages]);

  useEffect(() => {
    if (!loadTriggerRef.current || !allImages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, allImages.length));
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(loadTriggerRef.current);
    return () => observer.disconnect();
  }, [allImages]);

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

  const images = allImages ? allImages.slice(0, visibleCount) : null;

  return (
    <>
      <Header activeTab="gallery" />
      {allImages !== null && allImages.length === 0 && (
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
      {images && images.length > 0 && (
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
          {allImages && visibleCount < allImages.length && (
            <div ref={loadTriggerRef} style={{ height: 1 }} />
          )}
        </div>
      )}
    </>
  );
}
