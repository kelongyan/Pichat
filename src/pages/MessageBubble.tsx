import { memo } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ImageCard } from '../components/ImageCard';
import { formatDuration, getActiveVariant, getVariants } from './chatUtils';
import type { Message, Variant } from '../types';
import type { ImageAction } from '../lib/imageActions';
import styles from './Chat.module.css';

export const MessageBubble = memo(function MessageBubble({
  msg,
  index,
  isGenerating,
  onRetry,
  onVariantChange,
  onEdit,
  onFullscreen,
  onCopyPrompt,
  onImageAction,
  prompt,
}: {
  msg: Message;
  index: number;
  isGenerating: boolean;
  onRetry: (idx: number) => void;
  onVariantChange: (idx: number, dir: -1 | 1) => void;
  onEdit: (src: string) => void;
  onFullscreen: (src: string, prompt: string) => void;
  onCopyPrompt: (prompt: string) => void;
  onImageAction: (action: Exclude<ImageAction, 'copy'>, src: string, prompt: string) => void;
  prompt: string;
}) {
  const variant = getActiveVariant(msg);
  const variants = getVariants(msg);
  const hasImage = !!(variant?.imageId || variant?.imageBase64);

  return (
    <div className={`${styles.message} ${styles.messageAi}`}>
      {msg.error ? (
        <div className={`${styles.resultCard} ${styles.resultError}`}>
          <div className={styles.cardHeader}>
            <span className={styles.resultKicker}>Generation failed</span>
          </div>
          <div className="bubble-ai-error">{msg.error}</div>
          <div className={styles.messageActions}>
            <button
              className={styles.retry}
              title="Retry generation"
              disabled={isGenerating}
              onClick={() => onRetry(index)}
            >
              <RefreshCw size={16} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      ) : variant ? (
        <div className={`${styles.resultCard}${hasImage ? ` ${styles.resultCardImage}` : ''}`}>
          <div className={styles.cardHeader}>
            <span className={styles.resultKicker}>Result</span>
            <span className={styles.resultMeta}>
              {[variant.providerName, variant.size, variant.durationMs ? formatDuration(variant.durationMs) : null].filter(Boolean).join(' \u00B7 ')}
            </span>
          </div>
          {hasImage && (
            <div className={styles.imageFrame}>
              <ImageCard
                imageId={variant.imageId}
                imageBase64={variant.imageBase64}
                size={variant.size}
                prompt={prompt}
                timestamp={variant.timestamp}
                onEdit={onEdit}
                onFullscreen={(src) => onFullscreen(src, prompt)}
                onCopyPrompt={prompt ? () => onCopyPrompt(prompt) : undefined}
                onAction={(action, src) => onImageAction(action, src, prompt)}
              />
            </div>
          )}

          <div className={styles.messageActions}>
            {variants.length > 1 && (
              <div className={styles.variantNav}>
                <button
                  className={styles.variantBtn}
                  disabled={isGenerating || (msg.activeVariant || 0) === 0}
                  onClick={() => onVariantChange(index, -1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>{(msg.activeVariant || 0) + 1} / {variants.length}</span>
                <button
                  className={styles.variantBtn}
                  disabled={isGenerating || (msg.activeVariant || 0) >= variants.length - 1}
                  onClick={() => onVariantChange(index, 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button
              className={styles.retry}
              title={msg.error ? 'Retry generation' : 'Generate another variant'}
              disabled={isGenerating}
              onClick={() => onRetry(index)}
            >
              <RefreshCw size={16} />
              <span>Regenerate</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
