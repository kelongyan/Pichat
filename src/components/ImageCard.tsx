import { useEffect, useState } from 'react';
import { Download, Pencil, Maximize2, Copy, Sparkles, Star, Columns2, Tags } from 'lucide-react';
import { buildImageFilename } from '../lib/filename';
import { getImageURL, getThumbURL, getImageBlob, getImageBase64, toImageDataUrl } from '../lib/imageStore';
import { getImageActionLabel, type ImageAction } from '../lib/imageActions';
import { downloadBlob } from '../lib/download';
import styles from './ImageCard.module.css';

type CardImageAction = Exclude<ImageAction, 'same' | 'copy' | 'realistic' | 'illustration' | 'clean' | 'cinematic'>;

const CARD_ACTIONS: CardImageAction[] = ['style', 'background', 'ratio'];

interface ImageCardProps {
  imageBase64?: string;
  imageId?: string;
  size?: string;
  prompt?: string;
  timestamp?: number;
  useThumbnail?: boolean;
  favorite?: boolean;
  comparing?: boolean;
  tagsText?: string;
  onEdit?: (src: string) => void;
  onFullscreen?: (src: string) => void;
  onCopyPrompt?: () => void;
  onAction?: (action: CardImageAction, src: string) => void;
  onFavorite?: () => void;
  onCompare?: () => void;
  onTagsChange?: (value: string) => void;
  onTagsBlur?: () => void;
}

export function ImageCard({
  imageBase64,
  imageId,
  size = '1024x1024',
  prompt,
  timestamp,
  useThumbnail = false,
  favorite = false,
  comparing = false,
  tagsText = '',
  onEdit,
  onFullscreen,
  onCopyPrompt,
  onAction,
  onFavorite,
  onCompare,
  onTagsChange,
  onTagsBlur,
}: ImageCardProps) {
  const [src, setSrc] = useState(() =>
    imageBase64 ? toImageDataUrl(imageBase64) : ''
  );

  useEffect(() => {
    setSrc(imageBase64 ? toImageDataUrl(imageBase64) : '');
  }, [imageBase64]);

  useEffect(() => {
    if (!imageId) return;
    let cancelled = false;
    const loadUrl = useThumbnail ? getThumbURL : getImageURL;
    loadUrl(imageId).then((url) => { if (!cancelled && url) setSrc(url); });
    return () => { cancelled = true; };
  }, [imageId, useThumbnail]);

  /** Lazily resolve the full-resolution image URL (only on user action). */
  async function resolveFullSrc(): Promise<string> {
    if (imageId) {
      const url = await getImageURL(imageId);
      if (url) return url;
    }
    return src;
  }

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (imageId) {
      getImageBlob(imageId).then((blob) => {
        if (!blob) return;
        downloadBlob(buildImageFilename(prompt, timestamp), blob);
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
    return resolveFullSrc();
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
    resolveFullSrc().then((fsSrc) => onFullscreen?.(fsSrc));
  }

  function handleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    onFavorite?.();
  }

  function handleCompare(e: React.MouseEvent) {
    e.stopPropagation();
    onCompare?.();
  }

  function handleCardClick() {
    resolveFullSrc().then((fsSrc) => onFullscreen?.(fsSrc));
  }

  if (!src) return null;

  return (
    <div className={styles.imageCard} onClick={handleCardClick}>
      <img src={src} alt="Generated image" loading="lazy" />
      <div className={styles.overlay}>
        {/* 顶部：尺寸标签 + 下载/全屏 */}
        <div className={styles.overlayTop}>
          <span className={styles.badge}>{size}</span>
          <div className={styles.topActions}>
            <button
              className={`${styles.cardBtn} ${styles.cardBtnIcon}`}
              title="Download"
              onClick={handleDownload}
            >
              <Download size={13} />
            </button>
            <button
              className={`${styles.cardBtn} ${styles.cardBtnIcon}`}
              title="Fullscreen"
              onClick={handleFullscreen}
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>

        {/* 底部：Prompt + 操作按钮 */}
        <div className={styles.overlayBottom}>
          {prompt && <div className={styles.promptText}>{prompt}</div>}
          <div className={styles.actionRow}>
            <div className={styles.actionGroup}>
              {onCopyPrompt && (
                <button
                  className={styles.cardBtn}
                  title="Copy prompt"
                  onClick={handleCopyPrompt}
                >
                  <Copy size={11} /> Copy
                </button>
              )}
              {onAction && CARD_ACTIONS.map((action) => (
                <button
                  key={action}
                  className={styles.cardBtn}
                  title={`${getImageActionLabel(action)} from this image`}
                  onClick={(e) => handleAction(e, action)}
                >
                  <Sparkles size={11} />
                  {getImageActionLabel(action)}
                </button>
              ))}
              {onEdit && (
                <button
                  className={styles.cardBtn}
                  title="Edit with this image as reference"
                  onClick={handleEdit}
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
