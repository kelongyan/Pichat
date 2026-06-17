import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { SendData } from '../components/InputBar';
import { useConfigStore, useConversationStore } from '../lib/store';
import { useLazyImage } from '../hooks/useLazyImage';
import { revokeAll } from '../lib/imageStore';
import type { GalleryImage } from '../types';
import styles from './Landing.module.css';

function RecentThumb({ image, onClick }: { image: GalleryImage; onClick: () => void }) {
  const thumbSrc = useLazyImage(image.imageId, true);
  if (!thumbSrc) return null;
  return (
    <button className={styles.recentThumb} onClick={onClick} title={image.prompt}>
      <img src={thumbSrc} alt={image.prompt} loading="lazy" />
    </button>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const config = useConfigStore((s) => s.config);
  const getRecentImages = useConversationStore((s) => s.getRecentImages);
  const galleryVersion = useConversationStore((s) => s.galleryVersion);
  const providers = config?.providers || [];
  const providerId = config?.defaultProviderId || providers[0]?.id || '';

  const [recent, setRecent] = useState<GalleryImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    getRecentImages(8).then((images) => {
      if (!cancelled) setRecent(images);
    });
    return () => { cancelled = true; };
  }, [getRecentImages, galleryVersion]);

  useEffect(() => {
    return () => { revokeAll(); };
  }, []);

  function handleSend(data: SendData) {
    navigate('/chat', {
      state: {
        prompt: data.prompt,
        generationPrompt: data.generationPrompt,
        size: data.size,
        providerId: data.providerId || providerId,
        images: data.images,
        autoSend: true,
      },
    });
  }

  function handleRecentClick(img: GalleryImage) {
    navigate('/chat', { state: { conversationId: img.conversationId } });
  }

  return (
    <>
      <Header activeTab="create" />
      <div className={`${styles.landing} fade-in`}>
        <img src="assets/logo.png" alt="Pichat" className={styles.logo} />
        <h1 className={styles.heroTitle}>What would you like to create?</h1>
        <p className={styles.subtitle}>Describe any image and bring it to life</p>
        <div className={styles.inputWrapper}>
          <InputBar
            placeholder="Describe the image you want..."
            onSend={handleSend}
            providerId={providerId}
          />
        </div>
        {recent.length > 0 && (
          <div className={styles.recentSection}>
            <h2 className={styles.recentTitle}>Recent creations</h2>
            <div className={styles.recentGrid}>
              {recent.map((img) => (
                <RecentThumb key={img.id} image={img} onClick={() => handleRecentClick(img)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
