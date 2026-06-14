import { useEffect, useState } from 'react';
import { Download, Pencil, Maximize2, Copy, Sparkles } from 'lucide-react';
import { buildImageFilename } from '../lib/filename';
import { getImageURL, getThumbURL, getImageBlob, getImageBase64, toImageDataUrl } from '../lib/imageStore';
import { getImageActionLabel, type ImageAction } from '../lib/imageActions';

type CardImageAction = Exclude<ImageAction, 'copy' | 'realistic' | 'illustration' | 'clean' | 'cinematic'>;

const CARD_ACTIONS: CardImageAction[] = ['same', 'style', 'background', 'ratio'];

interface ImageCardProps {
  imageBase64?: string;
  imageId?: string;
  size?: string;
  prompt?: string;
  timestamp?: number;
  useThumbnail?: boolean;
  onEdit?: (src: string) => void;
  onFullscreen?: (src: string) => void;
  onCopyPrompt?: () => void;
  onAction?: (action: CardImageAction, src: string) => void;
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
  onCopyPrompt,
  onAction,
}: ImageCardProps) {
  const [src, setSrc] = useState(() =>
    imageBase64 ? toImageDataUrl(imageBase64) : ''
  );
  const [fullSrc, setFullSrc] = useState('');

  useEffect(() => {
    setSrc(imageBase64 ? toImageDataUrl(imageBase64) : '');
  }, [imageBase64]);

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

  async function getReferenceSrc(): Promise<string> {
    if (imageId) {
      const base64 = await getImageBase64(imageId);
      if (base64) return toImageDataUrl(base64);
    }
    return fullSrc || src;
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    getReferenceSrc().then((refSrc) => onEdit?.(refSrc));
  }

  function handleCopyPrompt(e: React.MouseEvent) {
    e.stopPropagation();
    onCopyPrompt?.();
  }

  function handleAction(e: React.MouseEvent, action: CardImageAction) {
    e.stopPropagation();
    getReferenceSrc().then((refSrc) => onAction?.(action, refSrc));
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
        {(onCopyPrompt || onAction) && (
          <div className="image-card-action-stack">
            {onCopyPrompt && (
              <button
                className="image-card-btn copy"
                title="Copy prompt"
                onClick={handleCopyPrompt}
              >
                <Copy size={12} /> Copy
              </button>
            )}
            {onAction && CARD_ACTIONS.map((action) => (
              <button
                key={action}
                className={`image-card-btn action action-${action}`}
                title={`${getImageActionLabel(action)} from this image`}
                onClick={(e) => handleAction(e, action)}
              >
                <Sparkles size={11} />
                {getImageActionLabel(action)}
              </button>
            ))}
          </div>
        )}
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
