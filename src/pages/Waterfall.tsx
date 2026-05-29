import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { InputBarHandle, SendData } from '../components/InputBar';
import { WarningPopup, hasSeenFirstTimeWarning } from '../components/WarningPopup';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { MarkdownRenderer } from '../lib/markdown';
import { generateImage } from '../lib/api';
import { useConfigStore, useConversationStore, generateId } from '../lib/store';
import { saveImage, getImageURL, getImageBlob, revokeAll } from '../lib/imageStore';
import { buildImageFilename } from '../lib/filename';
import { ChevronDown, Download, Save, Maximize2, RefreshCw, Play, Square } from 'lucide-react';

const TIER_PRESETS = [
  { value: 1, label: '1' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
];

const SUGGESTIONS = [
  'A serene mountain lake at sunset, oil painting',
  'Minimalist logo for a tech startup',
  'Cyberpunk city street in the rain, neon lights',
  'Watercolor portrait of a cat wearing glasses',
];

const ASPECT_RATIOS = ['1/1', '3/4', '4/3', '2/3'];
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_PENDING_BATCHES = 2;

interface WaterfallCard {
  id: string;
  state: 'loading' | 'image' | 'text' | 'error';
  aspectRatio: string;
  imageBase64?: string;
  imageId?: string;
  imageUrl?: string;
  text?: string;
  errorMessage?: string;
  streamText?: string;
  streamThinking?: string;
  streamImage?: string;
  saved?: boolean;
}

export default function Waterfall() {
  const { open: openLightbox } = useLightbox();
  const toast = useToast();
  const convStore = useConversationStore();
  const config = useConfigStore((s) => s.config);

  const [currentTier, setCurrentTier] = useState(5);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentSize, setCurrentSize] = useState('auto');
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentProviderId, setCurrentProviderId] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const cardMapRef = useRef(new Map<string, WaterfallCard>());
  const [cardVersion, setCardVersion] = useState(0);
  const cards = Array.from(cardMapRef.current.values());
  const [tierOpen, setTierOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [warningPopup, setWarningPopup] = useState<{
    type: 'first-time' | 'milestone';
    tier: number;
    count: number;
  } | null>(null);
  const warningBlockRef = useRef(false);

  const activeRequestsRef = useRef(0);
  const queuedCardIdsRef = useRef<string[]>([]);
  const drainQueueRef = useRef<() => void>(() => {});
  const triggerBatchRef = useRef<() => void>(() => {});
  const isPausedRef = useRef(false);
  const resumeAfterPauseRef = useRef(false);
  const sessionCountRef = useRef(0);
  const milestoneShownRef = useRef(new Set<number>());
  const abortControllersRef = useRef<AbortController[]>([]);
  const loadTriggerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputBarHandle>(null);
  const currentPromptRef = useRef('');
  const currentSizeRef = useRef('auto');
  const currentThinkingRef = useRef('');
  const currentProviderIdRef = useRef('');
  const currentTierRef = useRef(5);
  const currentImagesRef = useRef<string[]>([]);
  const currentGenerationPromptRef = useRef('');

  useEffect(() => {
    if (!tierOpen) return;
    const handleClick = () => setTierOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [tierOpen]);

  useEffect(() => { currentPromptRef.current = currentPrompt; }, [currentPrompt]);
  useEffect(() => { currentSizeRef.current = currentSize; }, [currentSize]);
  useEffect(() => { currentThinkingRef.current = currentThinking; }, [currentThinking]);
  useEffect(() => { currentProviderIdRef.current = currentProviderId; }, [currentProviderId]);
  useEffect(() => { currentTierRef.current = currentTier; }, [currentTier]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    if (!hasSeenFirstTimeWarning()) {
      setWarningPopup({ type: 'first-time', tier: currentTier, count: 0 });
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const ctrl of abortControllersRef.current) {
        ctrl.abort();
      }
      abortControllersRef.current = [];
      queuedCardIdsRef.current = [];
      revokeAll();
    };
  }, []);

  const requestCard = useCallback((cardId: string) => {
    activeRequestsRef.current++;
    const controller = new AbortController();
    abortControllersRef.current.push(controller);

    generateImage({
      prompt: currentGenerationPromptRef.current || currentPromptRef.current,
      size: currentSizeRef.current,
      thinking: currentThinkingRef.current,
      providerId: currentProviderIdRef.current,
      action: currentImagesRef.current.length ? 'edit' : 'auto',
      images: currentImagesRef.current,
      signal: controller.signal,
      onStream: (delta) => {
        const card = cardMapRef.current.get(cardId);
        if (!card || delta.imageBase64) return;
        if (delta.text && card.state === 'loading') {
          cardMapRef.current.set(cardId, { ...card, state: 'text', streamText: delta.text, aspectRatio: '' });
          setCardVersion((v) => v + 1);
        } else if (delta.text && card.state === 'text') {
          card.streamText = delta.text;
          setCardVersion((v) => v + 1);
        }
      },
    })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        if (result.imageBase64) {
          const imageId = await saveImage(result.imageBase64);
          if (controller.signal.aborted) return;
          const imageUrl = await getImageURL(imageId);
          if (controller.signal.aborted) return;
          const card = cardMapRef.current.get(cardId);
          if (card) {
            cardMapRef.current.set(cardId, { ...card, state: 'image', imageId, imageUrl, imageBase64: result.imageBase64!, aspectRatio: '' });
            setCardVersion((v) => v + 1);
          }
        } else if (result.text) {
          const card = cardMapRef.current.get(cardId);
          if (card) {
            cardMapRef.current.set(cardId, { ...card, state: 'text', text: result.text!, aspectRatio: '' });
            setCardVersion((v) => v + 1);
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          cardMapRef.current.delete(cardId);
          setCardVersion((v) => v + 1);
        } else {
          const card = cardMapRef.current.get(cardId);
          if (card) {
            cardMapRef.current.set(cardId, { ...card, state: 'error', errorMessage: err.message, aspectRatio: '' });
            setCardVersion((v) => v + 1);
          }
        }
      })
      .finally(() => {
        activeRequestsRef.current--;
        const idx = abortControllersRef.current.indexOf(controller);
        if (idx >= 0) abortControllersRef.current.splice(idx, 1);
        drainQueueRef.current();
        if (
          activeRequestsRef.current === 0
          && resumeAfterPauseRef.current
          && !isPausedRef.current
        ) {
          resumeAfterPauseRef.current = false;
          triggerBatchRef.current();
        }
      });
  }, []);

  const drainQueue = useCallback(() => {
    if (isPausedRef.current) return;
    while (
      activeRequestsRef.current < MAX_CONCURRENT_REQUESTS
      && queuedCardIdsRef.current.length > 0
    ) {
      const nextId = queuedCardIdsRef.current.shift();
      if (nextId) requestCard(nextId);
    }
  }, [requestCard]);

  useEffect(() => {
    drainQueueRef.current = drainQueue;
  }, [drainQueue]);

  const enqueueCard = useCallback((cardId: string) => {
    queuedCardIdsRef.current.push(cardId);
    drainQueue();
  }, [drainQueue]);

  const triggerBatch = useCallback(async () => {
    const prompt = currentPromptRef.current;
    if (!prompt || warningBlockRef.current || isPausedRef.current) return;

    const tier = currentTierRef.current;
    const maxPending = Math.max(tier, MAX_CONCURRENT_REQUESTS) * MAX_PENDING_BATCHES;
    const pendingCount = activeRequestsRef.current + queuedCardIdsRef.current.length;
    const batchSize = Math.min(tier, maxPending - pendingCount);
    if (batchSize <= 0) return;

    const nextCount = sessionCountRef.current + batchSize;
    const thresholds = [tier * 10, tier * 100, tier * 1000];
    for (const t of thresholds) {
      if (sessionCountRef.current < t && nextCount >= t && !milestoneShownRef.current.has(t)) {
        milestoneShownRef.current.add(t);
        sessionCountRef.current = nextCount;
        warningBlockRef.current = true;
        setWarningPopup({ type: 'milestone', tier, count: nextCount });
        return;
      }
    }
    sessionCountRef.current += batchSize;

    for (let i = 0; i < batchSize; i++) {
      const ratio = ASPECT_RATIOS[Math.floor(Math.random() * ASPECT_RATIOS.length)];
      const id = generateId();
      cardMapRef.current.set(id, { id, state: 'loading', aspectRatio: ratio });
      enqueueCard(id);
    }
    setCardVersion((v) => v + 1);
  }, [enqueueCard]);

  useEffect(() => {
    triggerBatchRef.current = triggerBatch;
  }, [triggerBatch]);

  useEffect(() => {
    if (!loadTriggerRef.current || !scrollContainerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!currentPromptRef.current || loadingMoreRef.current || isPausedRef.current) return;
        const maxPending = Math.max(currentTierRef.current, MAX_CONCURRENT_REQUESTS) * MAX_PENDING_BATCHES;
        if (activeRequestsRef.current + queuedCardIdsRef.current.length >= maxPending) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        triggerBatch().finally(() => {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        });
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    );
    observer.observe(loadTriggerRef.current);
    return () => observer.disconnect();
  }, [isActive, triggerBatch]);

  async function handleSend(data: SendData) {
    if (!data.prompt.trim()) return;
    setCurrentPrompt(data.prompt.trim());
    currentPromptRef.current = data.prompt.trim();
    currentGenerationPromptRef.current = data.generationPrompt || data.prompt.trim();
    setCurrentSize(data.size || 'auto');
    setCurrentThinking(data.thinking || inputRef.current?.getThinking() || '');
    setCurrentProviderId(data.providerId || inputRef.current?.getProviderId() || '');
    currentProviderIdRef.current = data.providerId || inputRef.current?.getProviderId() || '';
    currentImagesRef.current = data.images || [];
    isPausedRef.current = false;
    setIsPaused(false);
    setIsActive(true);
    await triggerBatch();
  }

  function handlePauseGeneration() {
    isPausedRef.current = true;
    resumeAfterPauseRef.current = false;
    setIsPaused(true);
    loadingMoreRef.current = false;
    setLoadingMore(false);

    const queuedIds = queuedCardIdsRef.current;
    queuedCardIdsRef.current = [];
    for (const id of queuedIds) {
      cardMapRef.current.delete(id);
    }
    for (const ctrl of abortControllersRef.current) {
      ctrl.abort();
    }
    setCardVersion((v) => v + 1);
    toast.show('Generation paused');
  }

  function handleResumeGeneration() {
    isPausedRef.current = false;
    setIsPaused(false);
    toast.show('Generation resumed');
    if (activeRequestsRef.current > 0) {
      resumeAfterPauseRef.current = true;
      return;
    }
    triggerBatch();
  }

  function handleChip(text: string) {
    inputRef.current?.setText(text);
    inputRef.current?.textInput?.focus();
  }

  async function saveToGallery(imageId: string, prompt: string) {
    const now = Date.now();
    const generationPrompt = currentGenerationPromptRef.current;
    const provider = config?.providers.find((item) => item.id === currentProviderIdRef.current)
      || config?.providers.find((item) => item.id === config.defaultProviderId)
      || config?.providers[0];
    const conv = {
      id: generateId(),
      createdAt: now,
      messages: [
        {
          role: 'user' as const,
          text: prompt,
          generationPrompt: generationPrompt && generationPrompt !== prompt ? generationPrompt : undefined,
          timestamp: now,
        },
        {
          role: 'assistant' as const,
          variants: [{
            imageId,
            providerId: provider?.id,
            providerName: provider?.name,
            model: provider?.model,
            size: 'auto',
            timestamp: now,
          }],
          activeVariant: 0,
          timestamp: now,
        },
      ],
    };
    await convStore.save(conv);
    toast.show('Saved to Gallery', { type: 'success' });
  }

  function handleRetryCard(cardId: string) {
    const card = cardMapRef.current.get(cardId);
    if (!card) return;
    cardMapRef.current.set(cardId, { ...card, state: 'loading', errorMessage: undefined, aspectRatio: '1/1' });
    setCardVersion((v) => v + 1);
    enqueueCard(cardId);
  }

  return (
    <>
      <Header activeTab="waterfall" />
      {warningPopup && (
        <WarningPopup
          type={warningPopup.type}
          tier={warningPopup.tier}
          count={warningPopup.count}
          onClose={() => {
            setWarningPopup(null);
            if (warningBlockRef.current) {
              warningBlockRef.current = false;
              triggerBatch();
            }
          }}
        />
      )}

      <div className="waterfall-wrapper">
        <div className="waterfall-tier-bar">
          <div className="ghost-dropdown">
            <button
              className={`ghost-dropdown-trigger${tierOpen ? ' open' : ''}`}
              onClick={(e) => { e.stopPropagation(); setTierOpen((v) => !v); }}
            >
              <span className="ghost-dropdown-prefix">Batch</span>
              <span className="ghost-dropdown-value">{currentTier}</span>
              <span className="ghost-dropdown-arrow"><ChevronDown size={12} /></span>
            </button>
            <div className={`ghost-dropdown-menu${tierOpen ? ' open' : ''}`}>
              {TIER_PRESETS.map((p) => (
                <div
                  key={p.value}
                  className={`ghost-dropdown-item${p.value === currentTier ? ' active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentTier(p.value);
                    setTierOpen(false);
                  }}
                >
                  {p.label}
                </div>
              ))}
            </div>
          </div>
          {isActive && (
            <button
              className={`waterfall-control-btn${isPaused ? ' paused' : ''}`}
              type="button"
              title={isPaused ? 'Resume generation' : 'Pause generation'}
              onClick={isPaused ? handleResumeGeneration : handlePauseGeneration}
            >
              {isPaused ? <Play size={14} fill="currentColor" /> : <Square size={12} fill="currentColor" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
          )}
        </div>

        {!isActive && (
          <div className="waterfall-landing">
            <img src="assets/OpenAI.png" alt="Pichat" className="landing-logo" />
            <h1 className="landing-title">What world will you flood with art?</h1>
            <p className="landing-subtitle">One prompt, endless creations</p>
            <div className="landing-input">
              <InputBar
                ref={inputRef}
                placeholder="Describe the images you want to generate..."
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
          </div>
        )}

        {isActive && (
          <div className="waterfall-scroll" ref={scrollContainerRef}>
            <div className="waterfall-grid">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className={`waterfall-card${card.state === 'loading' ? ' loading' : ''}${card.state === 'text' ? ' text-card' : ''}${card.state === 'error' ? ' error-card' : ''}`}
                  style={card.aspectRatio ? { aspectRatio: card.aspectRatio, cursor: card.state === 'image' ? 'pointer' : undefined } : { cursor: card.state === 'image' ? 'pointer' : undefined }}
                  onClick={() => {
                    if (card.state === 'image' && (card.imageUrl || card.imageBase64)) {
                      const src = card.imageUrl || `data:image/png;base64,${card.imageBase64}`;
                      openLightbox(src, { prompt: currentPrompt });
                    }
                  }}
                >
                  {card.state === 'loading' && null}

                  {card.state === 'image' && (card.imageUrl || card.imageBase64) && (
                    <>
                      <img
                        src={card.imageUrl || `data:image/png;base64,${card.imageBase64}`}
                        alt={currentPrompt}
                        loading="lazy"
                      />
                      <div className="waterfall-card-overlay">
                        <button
                          className="waterfall-card-btn"
                          title="Save to Gallery"
                          style={card.saved ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (card.imageId) {
                              saveToGallery(card.imageId, currentPrompt);
                              const c = cardMapRef.current.get(card.id);
                              if (c) {
                                cardMapRef.current.set(card.id, { ...c, saved: true });
                                setCardVersion((v) => v + 1);
                              }
                            }
                          }}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          className="waterfall-card-btn"
                          title="Download"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (card.imageId) {
                              getImageBlob(card.imageId).then((blob) => {
                                if (!blob) return;
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = buildImageFilename(currentPrompt);
                                a.click();
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                              });
                            } else if (card.imageBase64) {
                              const a = document.createElement('a');
                              a.href = `data:image/png;base64,${card.imageBase64}`;
                              a.download = buildImageFilename(currentPrompt);
                              a.click();
                            }
                          }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="waterfall-card-btn"
                          title="Fullscreen"
                          onClick={(e) => {
                            e.stopPropagation();
                            const src = card.imageUrl || `data:image/png;base64,${card.imageBase64}`;
                            openLightbox(src, { prompt: currentPrompt });
                          }}
                        >
                          <Maximize2 size={14} />
                        </button>
                      </div>
                    </>
                  )}

                  {card.state === 'text' && (
                    <div className="waterfall-text-content">
                      <MarkdownRenderer content={card.text || card.streamText || ''} />
                    </div>
                  )}

                  {card.state === 'error' && (
                    <>
                      <div>{card.errorMessage}</div>
                      <button onClick={(e) => { e.stopPropagation(); handleRetryCard(card.id); }}>
                        <RefreshCw size={12} /> Retry
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className={`waterfall-load-trigger${loadingMore ? ' loading' : ''}${isPaused ? ' paused' : ''}`} ref={loadTriggerRef}>
              <div className="waterfall-load-arrow">{isPaused ? '||' : loadingMore ? '⟳' : '↓'}</div>
              <div className="waterfall-load-text">{isPaused ? 'Generation paused' : loadingMore ? 'Generating...' : 'Scroll to generate more'}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
