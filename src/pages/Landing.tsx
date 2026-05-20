import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { InputBarHandle, SendData } from '../components/InputBar';
import { useLightbox } from '../components/Lightbox';
import { useConversationStore } from '../lib/store';
import { getThumbURL, getImageURL } from '../lib/imageStore';
import type { GalleryImage } from '../types';

const SUGGESTIONS = [
  'A serene mountain lake at sunset, oil painting',
  'Minimalist logo for a tech startup',
  'Cyberpunk city street in the rain, neon lights',
  'Watercolor portrait of a cat wearing glasses',
];

function RecentThumb({ img, onClick }: { img: GalleryImage; onClick: () => void }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (img.imageId) {
      getThumbURL(img.imageId).then((url) => { if (url) setSrc(url); });
    } else if (img.imageBase64) {
      setSrc(`data:image/png;base64,${img.imageBase64}`);
    }
  }, [img.imageId, img.imageBase64]);

  if (!src) return null;
  return (
    <div className="recent-thumb" onClick={onClick}>
      <img src={src} alt={img.prompt} />
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { open: openLightbox } = useLightbox();
  const getRecentImages = useConversationStore((s) => s.getRecentImages);

  const inputRef = useRef<InputBarHandle>(null);
  const [recentImages, setRecentImages] = useState<GalleryImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    getRecentImages(6).then((imgs) => {
      if (!cancelled) setRecentImages(imgs);
    });
    return () => { cancelled = true; };
  }, [getRecentImages]);

  function handleSend(data: SendData) {
    navigate('/chat', {
      state: {
        prompt: data.prompt,
        size: data.size,
        thinking: data.thinking,
        images: data.images,
        autoSend: true,
      },
    });
  }

  function handleChip(text: string) {
    const input = inputRef.current?.textInput;
    if (input) {
      inputRef.current?.setText(text);
      input.focus();
    }
  }

  function handleThumbClick(img: GalleryImage) {
    if (img.imageId) {
      getImageURL(img.imageId).then((url) => {
        if (url) openLightbox(url, { prompt: img.prompt });
      });
    } else if (img.imageBase64) {
      openLightbox(`data:image/png;base64,${img.imageBase64}`, { prompt: img.prompt });
    }
  }

  return (
    <>
      <Header activeTab="create" />
      <div className="landing fade-in">
        <img src="assets/OpenAI.png" alt="Pichat" className="landing-logo" />
        <h1 className="landing-title">What would you like to create?</h1>
        <p className="landing-subtitle">Describe any image and bring it to life</p>
        <div className="landing-input">
          <InputBar
            ref={inputRef}
            placeholder="Describe the image you want..."
            onSend={handleSend}
          />
        </div>
        <div className="suggestion-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" title={s} onClick={() => handleChip(s)}>
              {s.length > 40 ? s.slice(0, 40) + '...' : s}
            </button>
          ))}
        </div>
        {recentImages.length > 0 && (
          <div className="recent-row">
            <div className="recent-label">Recent creations</div>
            <div className="recent-grid">
              {recentImages.map((img, i) => (
                <RecentThumb key={img.imageId || i} img={img} onClick={() => handleThumbClick(img)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
