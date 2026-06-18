import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon, Search, Star, X } from 'lucide-react';
import { Header } from '../components/Header';
import { ImageCard } from '../components/ImageCard';
import { EmptyState } from '../components/EmptyState';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { useConversationStore } from '../lib/store';
import { getImageURL, revokeAll, toImageDataUrl } from '../lib/imageStore';
import { buildImageActionPrompt } from '../lib/imageActions';
import { copyToClipboard } from '../lib/clipboard';
import { useLazyImage } from '../hooks/useLazyImage';
import {
  buildGalleryImageKey,
  filterGalleryImages,
  getAllGalleryTags,
  getGalleryModels,
  getGalleryProviders,
  loadGalleryMeta,
  saveGalleryMeta,
  setGalleryTags,
  toggleGalleryFavorite,
  type GalleryFilterState,
  type GalleryMetaMap,
} from '../lib/galleryMeta';
import type { GalleryImage } from '../types';
import styles from './Gallery.module.css';

const DEFAULT_FILTERS: GalleryFilterState = {
  query: '',
  favoriteOnly: false,
  provider: '',
  model: '',
  tag: '',
  sort: 'newest',
};

function GalleryCompareThumb({ image }: { image: GalleryImage }) {
  const thumbSrc = useLazyImage(image.imageId, true);
  const base64Src = image.imageBase64 ? toImageDataUrl(image.imageBase64) : '';
  const src = thumbSrc || base64Src;

  if (!src) return null;
  return (
    <div className={styles.compareThumb}>
      <img src={src} alt="" />
      <span>{image.prompt}</span>
    </div>
  );
}

export default function Gallery() {
  const navigate = useNavigate();
  const { open: openLightbox } = useLightbox();
  const toast = useToast();
  const getAllImages = useConversationStore((s) => s.getAllImages);
  const galleryVersion = useConversationStore((s) => s.galleryVersion);

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<GalleryMetaMap>(() => loadGalleryMeta());
  const [filters, setFilters] = useState<GalleryFilterState>(DEFAULT_FILTERS);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [compareKeys, setCompareKeys] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getAllImages().then((page) => {
      if (cancelled) return;
      setImages(page);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [getAllImages, galleryVersion]);

  useEffect(() => {
    return () => { revokeAll(); };
  }, []);

  const filteredImages = useMemo(() => filterGalleryImages(images, filters, meta), [filters, images, meta]);
  const providers = useMemo(() => getGalleryProviders(images), [images]);
  const models = useMemo(() => getGalleryModels(images), [images]);
  const tags = useMemo(() => getAllGalleryTags(meta), [meta]);
  const compareImages = useMemo(() => (
    compareKeys
      .map((key) => images.find((img) => buildGalleryImageKey(img) === key))
      .filter((img): img is GalleryImage => !!img)
  ), [compareKeys, images]);
  const hasFilters = filters.query || filters.favoriteOnly || filters.provider || filters.model || filters.tag || filters.sort !== 'newest';

  function updateFilters(patch: Partial<GalleryFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function persistMeta(next: GalleryMetaMap) {
    setMeta(next);
    saveGalleryMeta(next);
  }

  function handleFavorite(img: GalleryImage) {
    persistMeta(toggleGalleryFavorite(meta, buildGalleryImageKey(img)));
  }

  function saveTags(img: GalleryImage) {
    const key = buildGalleryImageKey(img);
    const draft = tagDrafts[key] ?? (meta[key]?.tags || []).join(', ');
    persistMeta(setGalleryTags(meta, key, draft.split(',')));
    setTagDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function toggleCompare(img: GalleryImage) {
    const key = buildGalleryImageKey(img);
    setCompareKeys((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      return [...prev.slice(Math.max(0, prev.length - 3)), key];
    });
  }

  const handleEdit = useCallback((src: string) => {
    navigate('/chat', { state: { images: [src] } });
  }, [navigate]);

  const handleCopyPrompt = useCallback(async (prompt: string) => {
    await copyToClipboard(prompt.trim(), toast);
  }, [toast]);

  const handleAction = useCallback((action: 'same' | 'style' | 'background' | 'ratio', src: string, img: GalleryImage) => {
    navigate('/chat', {
      state: {
        images: [src],
        prompt: buildImageActionPrompt(action, img.prompt),
      },
    });
  }, [navigate]);

  const handleFullscreen = useCallback((img: GalleryImage) => {
    if (img.imageId) {
      getImageURL(img.imageId).then((url) => {
        if (url) openLightbox(url, { prompt: img.prompt });
      });
    } else if (img.imageBase64) {
      openLightbox(toImageDataUrl(img.imageBase64), { prompt: img.prompt });
    }
  }, [openLightbox]);

  return (
    <>
      <Header activeTab="gallery" />
      {loaded && images.length === 0 && (
        <EmptyState
          icon={<ImageIcon size={48} strokeWidth={1} />}
          title="No images yet"
          subtitle="Create your first image to see it here"
        />
      )}
      {images.length > 0 && (
        <div className={`${styles.shell} fade-in`}>
          <div className={styles.toolbar}>
            <div className={styles.searchRow}>
              <label className={styles.search} aria-label="Search gallery">
                <Search size={16} />
                <input
                  value={filters.query}
                  onChange={(e) => updateFilters({ query: e.target.value })}
                  placeholder="Search prompt..."
                />
              </label>
              <button
                className={`${styles.favoriteBtn}${filters.favoriteOnly ? ` ${styles.favoriteBtnActive}` : ''}`}
                type="button"
                aria-pressed={filters.favoriteOnly}
                onClick={() => updateFilters({ favoriteOnly: !filters.favoriteOnly })}
              >
                <Star size={15} fill={filters.favoriteOnly ? 'currentColor' : 'none'} />
                <span>Favorites</span>
              </button>
            </div>
          </div>

          {filteredImages.length === 0 ? (
            <div className={styles.emptyState}>No images match these filters</div>
          ) : (
            <div className={styles.grid}>
              {filteredImages.map((img) => {
                const key = buildGalleryImageKey(img);
                const entry = meta[key] || {};
                const comparing = compareKeys.includes(key);

                return (
                  <ImageCard
                    key={key}
                    imageId={img.imageId}
                    imageBase64={img.imageBase64}
                    size={img.size}
                    prompt={img.prompt}
                    timestamp={img.timestamp}
                    useThumbnail
                    onEdit={handleEdit}
                    onFullscreen={() => handleFullscreen(img)}
                    onCopyPrompt={() => handleCopyPrompt(img.prompt)}
                    onAction={(action, src) => handleAction(action, src, img)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
      {compareImages.length >= 2 && (
        <div className={styles.comparePanel}>
          <div className={styles.compareHeader}>
            <span>Compare</span>
            <button type="button" title="Clear compare" onClick={() => setCompareKeys([])}>
              <X size={14} />
            </button>
          </div>
          <div className={styles.compareGrid}>
            {compareImages.map((img) => (
              <GalleryCompareThumb key={buildGalleryImageKey(img)} image={img} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
