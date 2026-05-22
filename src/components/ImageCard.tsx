import { useEffect, useState } from 'react';
import { Download, Pencil, Maximize2 } from 'lucide-react';
import { buildImageFilename } from '../lib/filename';
import { getImageURL, getThumbURL, getImageBlob, getImageBase64 } from '../lib/imageStore';

interface ImageCardProps {
  imageBase64?: string;
  imageId?: string;
  size?: string;
  prompt?: string;
  timestamp?: number;
  useThumbnail?: boolean;
  onEdit?: (src: string) => void;
  onFullscreen?: (src: string) => void;
}

export function ImageCard({
  imageBase64,
  imageId,
  size = '1024x1024',
  prompt,
  timestamp,
  useThumbnail = false,
  onEdit,
  onFullscreen,
}: ImageCardProps) {
  const [src, setSrc] = useState(() =>
    imageBase64 ? `data:image/png;base64,${imageBase64}` : ''
  );
  const [fullSrc, setFullSrc] = useState('');

  useEffect(() => {
    if (imageId) {
      const loadUrl = useThumbnail ? getThumbURL : getImageURL;
      loadUrl(imageId).then((url) => { if (url) setSrc(url); });
      getImageURL(imageId).then((url) => { if (url) setFullSrc(url); });
    }
  }, [imageId, useThumbnail]);

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (imageId) {
      getImageBlob(imageId).then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildImageFilename(prompt, timestamp);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    } else {
      const a = document.createElement('a');
      a.href = src;
      a.download = buildImageFilename(prompt, timestamp);
      a.click();
    }
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    if (imageId) {
      getImageBase64(imageId).then((base64) => {
        if (base64) {
          onEdit?.(`data:image/png;base64,${base64}`);
        } else {
          onEdit?.(fullSrc || src);
        }
      });
    } else {
      onEdit?.(src);
    }
  }

  function handleFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const fsSrc = fullSrc || src;
    onFullscreen?.(fsSrc);
  }

  function handleCardClick() {
    const fsSrc = fullSrc || src;
    onFullscreen?.(fsSrc);
  }

  if (!src) return null;

  return (
    <div className="image-card" onClick={handleCardClick}>
      <img src={src} alt="Generated image" loading="lazy" />
      <div className="image-card-overlay">
        <span className="image-card-badge">{size}</span>
        <button
          className="image-card-btn download"
          title="Download"
          onClick={handleDownload}
        >
          <Download size={14} />
        </button>
        <button
          className="image-card-btn edit"
          title="Edit with this image as reference"
          onClick={handleEdit}
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          className="image-card-btn fullscreen"
          title="Fullscreen"
          onClick={handleFullscreen}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
