import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Plus, ArrowUp, Square, ChevronDown } from 'lucide-react';
import { compressImage } from '../lib/imageStore';
import {
  ASPECT_OPTIONS,
  RESOLUTION_OPTIONS,
  resolveImageSize,
  type ImageAspect,
  type ImageResolution,
} from '../lib/imagePresets';
import styles from './InputBar.module.css';

export interface SendData {
  prompt: string;
  generationPrompt?: string;
  size: string;
  providerId: string;
  images: string[];
}

export interface InputBarHandle {
  textInput: HTMLTextAreaElement | null;
  getProviderId: () => string;
  setImages: (imgs: string[]) => void;
  setText: (text: string) => void;
  clear: () => void;
}

interface InputBarProps {
  placeholder?: string;
  onSend: (data: SendData) => void;
  isGenerating?: boolean;
  onStop?: () => void;
  providerId: string;
  generationPrompt?: string;
}

export const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar(
  {
    placeholder = 'Describe the image you want...',
    onSend,
    isGenerating = false,
    onStop,
    providerId,
    generationPrompt,
  },
  ref,
) {
  const [selectedAspect, setSelectedAspect] = useState<ImageAspect>('auto');
  const [selectedResolution, setSelectedResolution] = useState<ImageResolution>('standard');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function clampAndAlign(value: number): number {
    const clamped = Math.min(4096, Math.max(256, value));
    return Math.round(clamped / 16) * 16;
  }

  function getSize() {
    if (selectedAspect === 'custom') {
      const w = clampAndAlign(parseInt(customW) || 1024);
      const h = clampAndAlign(parseInt(customH) || 1024);
      return `${w}x${h}`;
    }
    return resolveImageSize(selectedAspect, selectedResolution);
  }

  const customWNum = parseInt(customW) || 0;
  const customHNum = parseInt(customH) || 0;
  const customWAligned = clampAndAlign(customWNum);
  const customHAligned = clampAndAlign(customHNum);
  const hasAlignWarning = (customW && customWNum !== customWAligned) || (customH && customHNum !== customHAligned);

  useImperativeHandle(
    ref,
    () => ({
      textInput: textRef.current,
      getProviderId: () => providerId,
      setImages: (imgs: string[]) => setAttachedImages(imgs),
      setText: (t: string) => setText(t),
      clear: () => {
        setText('');
        setAttachedImages([]);
        if (textRef.current) textRef.current.style.height = 'auto';
      },
    }),
    [providerId],
  );

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [text]);

  function selectAspect(value: ImageAspect) {
    setSelectedAspect(value);
  }

  function selectResolution(value: ImageResolution) {
    setSelectedResolution(value);
    if (selectedAspect === 'auto') {
      setSelectedAspect('1:1');
    }
  }

  function doSend() {
    if (isGenerating) return;
    const prompt = text.trim();
    if (!prompt) return;
    onSend({
      prompt,
      generationPrompt,
      size: getSize(),
      providerId,
      images: [...attachedImages],
    });
  }

  function addImageFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const compressed = await compressImage(result);
      setAttachedImages((prev) => [...prev, compressed]);
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) addImageFile(file);
    e.target.value = '';
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        addImageFile(item.getAsFile());
      }
    }
  }

  function removeImage(idx: number) {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  }

  const inputPlaceholder = attachedImages.length > 0
    ? 'What would you like to change or keep?'
    : placeholder;

  return (
    <div>
      <button
        type="button"
        className={`${styles.extraToggle}${settingsOpen ? ` ${styles.extraToggleOpen}` : ''}`}
        onClick={() => setSettingsOpen((v) => !v)}
      >
        <ChevronDown size={14} />
        <span>Ratio & Quality</span>
      </button>

      <div className={`${styles.extra}${settingsOpen ? ` ${styles.extraOpen}` : ''}`}>
        <div className="generation-settings" aria-label="Image generation settings">
          <div className="generation-setting-group">
            <span className="generation-setting-label">Ratio</span>
            <div className="generation-pill-row">
              {ASPECT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`generation-pill${selectedAspect === option.value ? ' active' : ''}`}
                  title={option.title}
                  aria-pressed={selectedAspect === option.value}
                  onClick={() => selectAspect(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="generation-setting-group">
            <span className="generation-setting-label">Quality</span>
            <div className="generation-pill-row">
              {RESOLUTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`generation-pill${selectedResolution === option.value ? ' active' : ''}`}
                  title={option.title}
                  aria-pressed={selectedResolution === option.value}
                  onClick={() => selectResolution(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedAspect === 'custom' && (
          <div className="size-custom-row">
            <input
              type="number"
              className="size-custom-input"
              placeholder="W"
              min={256}
              max={4096}
              step={16}
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
            />
            <span className="size-custom-x">&times;</span>
            <input
              type="number"
              className="size-custom-input"
              placeholder="H"
              min={256}
              max={4096}
              step={16}
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
            />
            <span className={`size-custom-hint${hasAlignWarning ? ' size-custom-hint-warn' : ''}`}>
              {hasAlignWarning
                ? `Will use ${customWAligned}x${customHAligned}`
                : `${customWAligned}x${customHAligned}`}
            </span>
          </div>
        )}
      </div>

      {attachedImages.length > 0 && (
        <div className={styles.referencePreview} aria-live="polite">
          <div className={styles.referenceThumbs}>
            {attachedImages.map((src, i) => (
              <button
                key={i}
                type="button"
                className={styles.referenceThumb}
                title="Remove reference image"
                aria-label={`Remove reference image ${i + 1}`}
                onClick={() => removeImage(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <div className={styles.referenceCopy}>
            <span className={styles.referenceTitle}>
              {attachedImages.length === 1
                ? 'Using this image as the starting point'
                : `Using ${attachedImages.length} images as the starting point`}
            </span>
            <span className={styles.referenceHint}>Write what should change or stay.</span>
          </div>
        </div>
      )}

      <div className={styles.inputBar}>
        <button
          className={styles.attachBtn}
          title="Attach reference image"
          onClick={() => fileRef.current?.click()}
        >
          <Plus size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <textarea
          ref={textRef}
          className={styles.textarea}
          placeholder={inputPlaceholder}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              doSend();
            }
          }}
          onPaste={handlePaste}
        />
        {isGenerating && onStop ? (
          <button
            className={styles.stopBtn}
            title="Stop generation"
            aria-label="Stop generation"
            onClick={onStop}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            disabled={!text.trim()}
            onClick={doSend}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
});
