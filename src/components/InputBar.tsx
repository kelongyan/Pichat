import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Plus, ArrowUp, ChevronDown, Square } from 'lucide-react';
import { useConfigStore } from '../lib/store';
import { compressImage } from '../lib/imageStore';
import type { ThinkingLevel } from '../types';

export interface SendData {
  prompt: string;
  size: string;
  thinking: string;
  providerId: string;
  images: string[];
}

export interface InputBarHandle {
  textInput: HTMLTextAreaElement | null;
  getThinking: () => string;
  getProviderId: () => string;
  setImages: (imgs: string[]) => void;
  setText: (text: string) => void;
}

interface InputBarProps {
  placeholder?: string;
  onSend: (data: SendData) => void;
  isGenerating?: boolean;
  onStop?: () => void;
  initialThinking?: ThinkingLevel;
  initialProviderId?: string;
}

const SIZE_PRESETS = [
  { value: 'auto', label: 'Auto' },
  { value: '1024x1024', label: '1024 × 1024 (1:1)' },
  { value: '1536x1024', label: '1536 × 1024 (3:2)' },
  { value: '1024x1536', label: '1024 × 1536 (2:3)' },
  { value: '1792x1024', label: '1792 × 1024 (16:9)' },
  { value: '1024x1792', label: '1024 × 1792 (9:16)' },
  { value: '2560x1440', label: '2560 × 1440 (2K)' },
  { value: '3840x2160', label: '3840 × 2160 (4K)' },
  { value: 'custom', label: 'Custom...' },
];

const THINKING_PRESETS: { value: ThinkingLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'xHigh' },
];

export const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar(
  {
    placeholder = 'Describe the image you want...',
    onSend,
    isGenerating = false,
    onStop,
    initialThinking = 'low',
    initialProviderId,
  },
  ref,
) {
  const config = useConfigStore((s) => s.config);
  const saveConfig = useConfigStore((s) => s.save);
  const providers = config?.providers || [];

  const [selectedSize, setSelectedSize] = useState('auto');
  const [selectedLabel, setSelectedLabel] = useState('Auto');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [selectedThinking, setSelectedThinking] = useState<ThinkingLevel>(
    config?.thinkingLevel || initialThinking,
  );
  const [selectedProviderId, setSelectedProviderId] = useState(
    initialProviderId || config?.defaultProviderId || providers[0]?.id || '',
  );
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [sizeOpen, setSizeOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);

  function getSize() {
    if (selectedSize === 'custom') {
      const w = Math.min(4096, Math.max(256, parseInt(customW) || 1024));
      const h = Math.min(4096, Math.max(256, parseInt(customH) || 1024));
      return `${w}x${h}`;
    }
    return selectedSize;
  }

  useImperativeHandle(
    ref,
    () => ({
      textInput: textRef.current,
      getThinking: () => selectedThinking,
      getProviderId: () => selectedProviderId,
      setImages: (imgs: string[]) => setAttachedImages(imgs),
      setText: (t: string) => setText(t),
    }),
    [selectedThinking, selectedProviderId],
  );

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (sizeRef.current && !sizeRef.current.contains(e.target as Node)) setSizeOpen(false);
      if (thinkingRef.current && !thinkingRef.current.contains(e.target as Node)) setThinkingOpen(false);
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) setProviderOpen(false);
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  useEffect(() => {
    if (providers.length === 0) return;
    const nextId = initialProviderId || config?.defaultProviderId || providers[0].id;
    if (!providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(nextId);
    }
  }, [config?.defaultProviderId, initialProviderId, providers, selectedProviderId]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [text]);

  function selectThinking(value: ThinkingLevel) {
    setSelectedThinking(value);
    if (config) saveConfig({ ...config, thinkingLevel: value });
    setThinkingOpen(false);
  }

  function selectSize(value: string, label: string) {
    setSelectedSize(value);
    setSelectedLabel(value === 'custom' ? 'Custom' : label);
    setSizeOpen(false);
  }

  function selectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    setProviderOpen(false);
  }

  function doSend() {
    if (isGenerating) return;
    const prompt = text.trim();
    if (!prompt) return;
    onSend({
      prompt,
      size: getSize(),
      thinking: selectedThinking,
      providerId: selectedProviderId,
      images: [...attachedImages],
    });
    setText('');
    setAttachedImages([]);
    if (textRef.current) textRef.current.style.height = 'auto';
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

  const initialThinkingLabel =
    THINKING_PRESETS.find((p) => p.value === selectedThinking)?.label || 'Low';
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
    || providers[0];

  return (
    <div>
      <div className="options-row">
        {selectedProvider && (
          <div className="ghost-dropdown" ref={providerRef}>
            <button
              className={`ghost-dropdown-trigger${providerOpen ? ' open' : ''}`}
              title={selectedProvider.name}
              onClick={(e) => {
                e.stopPropagation();
                setProviderOpen((v) => !v);
                setThinkingOpen(false);
                setSizeOpen(false);
              }}
            >
              <span className="ghost-dropdown-prefix">Provider</span>
              <span className="ghost-dropdown-value">{selectedProvider.name}</span>
              <span className="ghost-dropdown-arrow">
                <ChevronDown size={12} />
              </span>
            </button>
            <div className={`ghost-dropdown-menu${providerOpen ? ' open' : ''}`}>
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`ghost-dropdown-item${provider.id === selectedProviderId ? ' active' : ''}`}
                  title={`${provider.name} · ${provider.model}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectProvider(provider.id);
                  }}
                >
                  {provider.name}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="ghost-dropdown" ref={thinkingRef}>
          <button
            className={`ghost-dropdown-trigger${thinkingOpen ? ' open' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setThinkingOpen((v) => !v);
              setSizeOpen(false);
              setProviderOpen(false);
            }}
          >
            <span className="ghost-dropdown-prefix">Thinking</span>
            <span className="ghost-dropdown-value">{initialThinkingLabel}</span>
            <span className="ghost-dropdown-arrow">
              <ChevronDown size={12} />
            </span>
          </button>
          <div className={`ghost-dropdown-menu${thinkingOpen ? ' open' : ''}`}>
            {THINKING_PRESETS.map((p) => (
              <div
                key={p.value}
                className={`ghost-dropdown-item${p.value === selectedThinking ? ' active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectThinking(p.value);
                }}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div className="size-dropdown" ref={sizeRef}>
          <button
            className={`size-dropdown-trigger${sizeOpen ? ' open' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setSizeOpen((v) => !v);
              setThinkingOpen(false);
              setProviderOpen(false);
            }}
          >
            <span className="size-dropdown-label">{selectedLabel}</span>
            <span className="size-dropdown-arrow">
              <ChevronDown size={14} />
            </span>
          </button>
          <div className={`size-dropdown-menu${sizeOpen ? ' open' : ''}`}>
            {SIZE_PRESETS.map((p) => (
              <div
                key={p.value}
                className={`size-dropdown-item${p.value === selectedSize ? ' active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectSize(p.value, p.label);
                }}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedSize === 'custom' && (
        <div className="size-custom-row" style={{ display: 'flex' }}>
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
          <span className="size-custom-x">×</span>
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
          <span className="size-custom-hint">Divisible by 16</span>
        </div>
      )}

      {attachedImages.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '0 0 8px',
          }}
        >
          {attachedImages.map((src, i) => (
            <div
              key={i}
              title="Click to remove"
              onClick={() => removeImage(i)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                overflow: 'hidden',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              <img
                src={src}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                alt=""
              />
            </div>
          ))}
        </div>
      )}

      <div className="input-bar">
        <button
          className="input-bar-attach"
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
          className="input-bar-text"
          placeholder={placeholder}
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
            className="input-bar-stop"
            title="Stop generation"
            aria-label="Stop generation"
            onClick={onStop}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            className="input-bar-send"
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
