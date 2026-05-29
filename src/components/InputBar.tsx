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
import {
  ASPECT_OPTIONS,
  QUICK_PRESET_OPTIONS,
  RESOLUTION_OPTIONS,
  applyQuickPresetToPrompt,
  getQuickPresetDefaults,
  resolveImageSize,
  type ImageAspect,
  type ImageResolution,
  type QuickPreset,
} from '../lib/imagePresets';
import type { ThinkingLevel } from '../types';

export interface SendData {
  prompt: string;
  generationPrompt?: string;
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

  const [selectedAspect, setSelectedAspect] = useState<ImageAspect>('auto');
  const [selectedResolution, setSelectedResolution] = useState<ImageResolution>('standard');
  const [selectedQuickPreset, setSelectedQuickPreset] = useState<QuickPreset>('none');
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
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);

  function getSize() {
    if (selectedAspect === 'custom') {
      const w = Math.min(4096, Math.max(256, parseInt(customW) || 1024));
      const h = Math.min(4096, Math.max(256, parseInt(customH) || 1024));
      return `${w}x${h}`;
    }
    return resolveImageSize(selectedAspect, selectedResolution);
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

  function selectAspect(value: ImageAspect) {
    setSelectedAspect(value);
    if (selectedQuickPreset !== 'none') {
      setSelectedQuickPreset('none');
    }
  }

  function selectQuickPreset(value: Exclude<QuickPreset, 'none'>) {
    const nextPreset: QuickPreset = selectedQuickPreset === value ? 'none' : value;
    setSelectedQuickPreset(nextPreset);
    const defaults = getQuickPresetDefaults(nextPreset);
    if (defaults.aspect) {
      setSelectedAspect(defaults.aspect);
    }
  }

  function selectResolution(value: ImageResolution) {
    setSelectedResolution(value);
    if (selectedAspect === 'auto') {
      setSelectedAspect('1:1');
    }
  }

  function selectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    setProviderOpen(false);
  }

  function doSend() {
    if (isGenerating) return;
    const prompt = text.trim();
    if (!prompt) return;
    const generationPrompt = applyQuickPresetToPrompt(prompt, selectedQuickPreset);
    onSend({
      prompt,
      generationPrompt: generationPrompt === prompt ? undefined : generationPrompt,
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
  const inputPlaceholder = attachedImages.length > 0
    ? 'What would you like to change or keep?'
    : placeholder;

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
      </div>

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

        <div className="generation-setting-group generation-setting-group-wide">
          <span className="generation-setting-label">Quick</span>
          <div className="generation-pill-row">
            {QUICK_PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`generation-pill generation-pill-quick${selectedQuickPreset === option.value ? ' active' : ''}`}
                title={option.title}
                aria-pressed={selectedQuickPreset === option.value}
                onClick={() => selectQuickPreset(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedAspect === 'custom' && (
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
        <div className="reference-preview" aria-live="polite">
          <div className="reference-preview-thumbs">
            {attachedImages.map((src, i) => (
              <button
                key={i}
                type="button"
                className="reference-preview-thumb"
                title="Remove reference image"
                aria-label={`Remove reference image ${i + 1}`}
                onClick={() => removeImage(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <div className="reference-preview-copy">
            <span className="reference-preview-title">
              {attachedImages.length === 1
                ? 'Using this image as the starting point'
                : `Using ${attachedImages.length} images as the starting point`}
            </span>
            <span className="reference-preview-hint">Write what should change or stay.</span>
          </div>
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
