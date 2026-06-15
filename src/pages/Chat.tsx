import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { InputBarHandle, SendData } from '../components/InputBar';
import { ImageCard } from '../components/ImageCard';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { generateImage } from '../lib/api';
import { saveImage, toImageDataUrl } from '../lib/imageStore';
import { useConfigStore, useConversationStore, generateId } from '../lib/store';
import { buildImageActionPrompt, type ImageAction } from '../lib/imageActions';
import { recordGenerationOutcome } from '../lib/providerStats';
import { copyToClipboard } from '../lib/clipboard';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Conversation, Message, ProviderConfig, StreamStage, Variant } from '../types';

function getVariants(msg: Message): Variant[] {
  if (msg.variants) return msg.variants;
  if (msg.imageBase64) return [{ imageBase64: msg.imageBase64, size: msg.size || 'auto', timestamp: msg.timestamp }];
  return [];
}

function getActiveVariant(msg: Message): Variant | null {
  const variants = getVariants(msg);
  const idx = msg.activeVariant || 0;
  return variants[idx] || variants[0] || null;
}

function getReferenceImages(msg: Message): string[] {
  if (msg.imageDataUrls?.length) return msg.imageDataUrls;
  return msg.imageDataUrl ? [msg.imageDataUrl] : [];
}

function findPreviousUser(messages: Message[], fromIndex: number): Message | null {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i];
  }
  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface StreamState {
  text: string | null;
  imageBase64: string | null;
  done: boolean;
  stage: StreamStage | null;
  startedAt: number;
}

interface PhaseRecord {
  phase: string;
  startedAt: number;
  endedAt?: number;
}

const PHASES = [
  { key: 'generating' as const, label: 'Generating' },
];

// Isolated streaming bubble — owns its own render cycle with phase timeline + timer
function StreamBubble({ streamRef }: { streamRef: React.RefObject<StreamState | null> }) {
  const [state, setState] = useState<StreamState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(0);
  const phasesRef = useRef<PhaseRecord[]>([]);
  const lastStageRef = useRef<StreamStage | null>(null);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      const current = streamRef.current;
      if (!current) {
        setState((prev) => (prev ? null : prev));
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Track phase transitions
      if (current.stage && current.stage !== lastStageRef.current) {
        const phases = phasesRef.current;
        // Close previous active phase
        const now = performance.now();
        for (let i = phases.length - 1; i >= 0; i--) {
          if (!phases[i].endedAt) {
            phases[i].endedAt = now;
            break;
          }
        }
        // Start new phase
        phases.push({ phase: current.stage, startedAt: now });
        lastStageRef.current = current.stage;
      }

      // If all phases done, close last one
      if (current.done) {
        const now = performance.now();
        for (let i = phasesRef.current.length - 1; i >= 0; i--) {
          if (!phasesRef.current[i].endedAt) {
            phasesRef.current[i].endedAt = now;
            break;
          }
        }
      }

      setElapsed(Math.round(performance.now() - current.startedAt));

      setState((prev) => {
        if (prev && prev.text === current.text
          && prev.imageBase64 === current.imageBase64 && prev.stage === current.stage) return prev;
        return { ...current };
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [streamRef]);

  if (!state) return null;

  const stageLabel = state.stage === 'generating' ? 'Generating'
    : state.stage === 'complete' ? 'Complete'
    : 'Starting';

  return (
    <div className="message message-ai">
      <div className="result-card result-card-stream">
        <div className="result-card-header">
          <span className="result-card-kicker">{stageLabel}</span>
          <span className="result-card-timer">
            <span className="timer-value">{formatDuration(elapsed)}</span>
          </span>
        </div>

        {/* Phase timeline */}
        <div className="stream-timeline">
          {PHASES.map((phase) => {
            const record = phasesRef.current.find((r) => r.phase === phase.key);
            const isActive = state.stage === phase.key;
            const isDone = record?.endedAt != null && state.stage !== phase.key;
            const duration = record ? formatDuration(
              Math.round((record.endedAt ?? performance.now()) - record.startedAt)
            ) : null;

            let className = 'stream-phase';
            if (isActive) className += ' active';
            else if (isDone) className += ' done';

            return (
              <div key={phase.key} className={className}>
                <span className="stream-phase-dot" />
                <span className="stream-phase-label">{phase.label}</span>
                {duration && <span className="stream-phase-duration">{duration}</span>}
              </div>
            );
          })}
        </div>

        {state.imageBase64 ? (
          <div className="result-image-frame">
            <img
              src={toImageDataUrl(state.imageBase64)}
              alt=""
              className="stream-image"
            />
          </div>
        ) : (
          <div className="result-image-skeleton">
            <div className="result-image-sheen" />
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized individual message bubble
const MessageBubble = memo(function MessageBubble({
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
    <div className="message message-ai">
      {msg.error ? (
        <div className="result-card result-card-error">
          <div className="result-card-header">
            <span className="result-card-kicker">Generation failed</span>
          </div>
          <div className="bubble-ai-error">{msg.error}</div>
          <div className="message-actions">
            <button
              className="message-retry"
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
        <div className={`result-card${hasImage ? ' result-card-image' : ''}`}>
          <div className="result-card-header">
            <span className="result-card-kicker">Result</span>
            <span className="result-card-meta">
              {[variant.providerName, variant.size, variant.durationMs ? formatDuration(variant.durationMs) : null].filter(Boolean).join(' · ')}
            </span>
          </div>
          {hasImage && (
            <div className="result-image-frame">
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

          <div className="message-actions">
            {variants.length > 1 && (
              <div className="variant-nav">
                <button
                  className="variant-nav-btn"
                  disabled={isGenerating || (msg.activeVariant || 0) === 0}
                  onClick={() => onVariantChange(index, -1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>{(msg.activeVariant || 0) + 1} / {variants.length}</span>
                <button
                  className="variant-nav-btn"
                  disabled={isGenerating || (msg.activeVariant || 0) >= variants.length - 1}
                  onClick={() => onVariantChange(index, 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button
              className="message-retry"
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

export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openLightbox } = useLightbox();
  const toast = useToast();

  const state = (location.state || {}) as {
    conversationId?: string;
    prompt?: string;
    generationPrompt?: string;
    size?: string;
    providerId?: string;
    images?: string[];
    autoSend?: boolean;
  };

  const config = useConfigStore((s) => s.config);
  const convStore = useConversationStore();
  const inputRef = useRef<InputBarHandle>(null);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [retryingIdx, setRetryingIdx] = useState(-1);
  const streamRef = useRef<StreamState | null>(null);
  const [showStream, setShowStream] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);
  const stateImagesAppliedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const handleSendRef = useRef<(d: SendData) => Promise<void>>(() => Promise.resolve());

  const clearAutoSendState = useCallback((conversationId: string) => {
    navigate(location.pathname, {
      replace: true,
      state: { conversationId },
    });
  }, [location.pathname, navigate]);

  const handleStopGeneration = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    toast.show('Generation stopped');
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let conv: Conversation | null = null;
      if (state.conversationId) {
        conv = await convStore.get(state.conversationId);
      }
      if (!conv) {
        conv = { id: generateId(), createdAt: Date.now(), messages: [] };
      }
      if (!cancelled) setConversation(conv);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (!conversation) return;
    if (state.images?.length && !autoSentRef.current && !stateImagesAppliedRef.current) {
      stateImagesAppliedRef.current = true;
      inputRef.current?.setImages(state.images);
      if (!state.autoSend) {
        if (state.prompt) inputRef.current?.setText(state.prompt);
        inputRef.current?.textInput?.focus();
      }
    }
    if (state.autoSend && state.prompt && !autoSentRef.current) {
      autoSentRef.current = true;
      clearAutoSendState(conversation.id);
      handleSendRef.current({
        prompt: state.prompt,
        generationPrompt: state.generationPrompt,
        size: state.size || 'auto',
        providerId: state.providerId || config?.defaultProviderId || '',
        images: state.images || [],
      });
    }
  }, [clearAutoSendState, conversation, config?.defaultProviderId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    });
  }, []);

  function isNearBottom() {
    const el = messagesRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }

  async function runGeneration(args: {
    prompt: string;
    size?: string;
    providerId: string;
    provider: ProviderConfig | undefined;
    action: string;
    images: string[];
    history: Message[];
    errorTarget: Conversation;
  }): Promise<{ variant: Variant } | null> {
    if (isGenerating) return null;
    setIsGenerating(true);
    const startedAt = performance.now();
    streamRef.current = { text: null, imageBase64: null, done: false, stage: null, startedAt };
    setShowStream(true);
    scrollToBottom();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const result = await generateImage({
        prompt: args.prompt,
        size: args.size,
        providerId: args.providerId,
        action: args.action,
        images: args.images,
        history: args.history,
        signal: ctrl.signal,
        onStream: (delta) => {
          streamRef.current = {
            text: delta.text,
            imageBase64: delta.imageBase64,
            done: !!delta.done,
            stage: delta.stage || streamRef.current?.stage || null,
            startedAt,
          };
          if (isNearBottom()) scrollToBottom();
        },
      });
      if (ctrl.signal.aborted) return null;

      const imageId = result.imageBase64 ? await saveImage(result.imageBase64) : undefined;
      if (ctrl.signal.aborted) return null;

      recordGenerationOutcome({
        providerId: args.provider?.id || args.providerId || 'unknown',
        providerName: args.provider?.name,
        model: args.provider?.model,
        ok: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return {
        variant: {
          text: result.text || undefined,
          imageId,
          imageBase64: !imageId && result.imageBase64 ? result.imageBase64 : undefined,
          providerId: args.provider?.id,
          providerName: args.provider?.name,
          model: args.provider?.model,
          size: args.size || 'auto',
          timestamp: Date.now(),
          durationMs: Math.round(performance.now() - startedAt),
        },
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      const message = err instanceof Error ? err.message : 'Generation failed';
      recordGenerationOutcome({
        providerId: args.provider?.id || args.providerId || 'unknown',
        providerName: args.provider?.name,
        model: args.provider?.model,
        ok: false,
        durationMs: Math.round(performance.now() - startedAt),
        error: message,
      });
      toast.show(message, { type: 'error' });
      const errConv = { ...args.errorTarget };
      errConv.messages = [...errConv.messages, {
        role: 'assistant' as const,
        error: message,
        timestamp: Date.now(),
      }];
      setConversation(errConv);
      await convStore.save(errConv);
      return null;
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      streamRef.current = null;
      setShowStream(false);
      setIsGenerating(false);
      setRetryingIdx(-1);
      scrollToBottom();
    }
  }

  async function handleSend(data: SendData) {
    if (isGenerating || !conversation) return;
    const provider = config?.providers.find((item) => item.id === data.providerId)
      || config?.providers.find((item) => item.id === config.defaultProviderId)
      || config?.providers[0];

    const updatedConv = { ...conversation };
    updatedConv.messages = [...updatedConv.messages, {
      role: 'user' as const,
      text: data.prompt,
      generationPrompt: data.generationPrompt,
      imageDataUrls: data.images?.length ? data.images : undefined,
      imageDataUrl: data.images?.length ? data.images[0] : undefined,
      timestamp: Date.now(),
    }];
    setConversation(updatedConv);
    await convStore.save(updatedConv);
    scrollToBottom();

    // 清空输入栏（发送成功后）
    inputRef.current?.clear();

    const historyMessages = updatedConv.messages.slice(0, -1);
    const result = await runGeneration({
      prompt: data.generationPrompt || data.prompt,
      size: data.size,
      providerId: data.providerId,
      provider,
      action: data.images?.length ? 'edit' : 'auto',
      images: data.images || [],
      history: historyMessages,
      errorTarget: updatedConv,
    });
    if (!result) return;

    const finalConv = { ...updatedConv };
    finalConv.messages = [...finalConv.messages, {
      role: 'assistant' as const,
      variants: [result.variant],
      activeVariant: 0,
      timestamp: Date.now(),
    }];
    setConversation(finalConv);
    await convStore.save(finalConv);
  }

  handleSendRef.current = handleSend;

  const handleRetry = useCallback(async (msgIdx: number) => {
    if (isGenerating || !conversation) return;
    const msg = conversation.messages[msgIdx];

    let userMsg: Message | null = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (conversation.messages[i].role === 'user') { userMsg = conversation.messages[i]; break; }
    }
    if (!userMsg) return;

    setRetryingIdx(msgIdx);

    const refImages = getReferenceImages(userMsg);
    const activeVariant = getActiveVariant(msg);
    const retrySize = activeVariant?.size || 'auto';
    const retryProviderId = activeVariant?.providerId
      || inputRef.current?.getProviderId()
      || config?.defaultProviderId
      || '';
    const retryProvider = config?.providers.find((provider) => provider.id === retryProviderId)
      || config?.providers.find((provider) => provider.id === config.defaultProviderId)
      || config?.providers[0];

    const historyMessages = conversation.messages.slice(0, msgIdx);
    const result = await runGeneration({
      prompt: userMsg.generationPrompt || userMsg.text || '',
      size: retrySize,
      providerId: retryProviderId,
      provider: retryProvider,
      action: refImages.length ? 'edit' : 'auto',
      images: refImages,
      history: historyMessages,
      errorTarget: conversation,
    });

    if (!result) {
      return;
    }

    const updatedConv = { ...conversation };
    updatedConv.messages = [...updatedConv.messages];
    const updatedMsg = { ...updatedConv.messages[msgIdx] };

    if (updatedMsg.error) {
      updatedConv.messages[msgIdx] = {
        role: 'assistant',
        variants: [result.variant],
        activeVariant: 0,
        timestamp: Date.now(),
      };
    } else {
      const variants = [...getVariants(updatedMsg), result.variant];
      updatedMsg.variants = variants;
      updatedMsg.imageBase64 = undefined;
      updatedMsg.size = undefined;
      updatedMsg.activeVariant = variants.length - 1;
      updatedConv.messages[msgIdx] = updatedMsg;
    }
    setConversation(updatedConv);
    await convStore.save(updatedConv);
  }, [config, conversation, convStore, isGenerating]);

  const handleVariantChange = useCallback((msgIdx: number, direction: -1 | 1) => {
    if (!conversation) return;
    const updatedConv = { ...conversation };
    updatedConv.messages = [...updatedConv.messages];
    const msg = { ...updatedConv.messages[msgIdx] };
    const variants = getVariants(msg);
    const current = msg.activeVariant || 0;
    msg.activeVariant = Math.max(0, Math.min(variants.length - 1, current + direction));
    updatedConv.messages[msgIdx] = msg;
    setConversation(updatedConv);
    void convStore.save(updatedConv);
  }, [conversation, convStore]);

  const handleEdit = useCallback((src: string) => {
    inputRef.current?.setImages([src]);
    inputRef.current?.textInput?.focus();
  }, []);

  const handleFullscreen = useCallback((src: string, prompt: string) => {
    openLightbox(src, { prompt });
  }, [openLightbox]);

  const handleCopyPrompt = useCallback(async (prompt: string) => {
    await copyToClipboard(prompt.trim(), toast);
  }, [toast]);

  const handleImageAction = useCallback((action: Exclude<ImageAction, 'copy'>, src: string, prompt: string) => {
    inputRef.current?.setImages([src]);
    inputRef.current?.setText(buildImageActionPrompt(action, prompt));
    inputRef.current?.textInput?.focus();
  }, []);

  return (
    <>
      <Header activeTab="create" showNewChat />
      <div className="chat-messages" ref={messagesRef}>
        {conversation?.messages.map((msg, i) => {
          if (msg.role === 'user') {
            const referenceImages = getReferenceImages(msg);
            return (
              <div key={i} className="message message-user">
                <div className="prompt-card">
                  <div className="prompt-card-header">
                    <span>Prompt</span>
                    {referenceImages.length > 0 && (
                      <span>{referenceImages.length === 1 ? 'Reference attached' : `${referenceImages.length} references attached`}</span>
                    )}
                  </div>
                  {referenceImages.length > 0 ? (
                    <div className="prompt-card-body has-reference">
                      <div className="prompt-reference-thumbs">
                        {referenceImages.map((src, idx) => (
                          <img
                            key={`${idx}-${src.slice(0, 24)}`}
                            src={src}
                            className="prompt-reference-thumb"
                            alt=""
                          />
                        ))}
                      </div>
                      <div className="prompt-text">{msg.text}</div>
                    </div>
                  ) : (
                    <div className="prompt-text">{msg.text}</div>
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            if (retryingIdx >= 0 && i === retryingIdx && showStream) {
              return (
                <div key={i}>
                  <StreamBubble streamRef={streamRef} />
                </div>
              );
            }

            const userPrompt = findPreviousUser(conversation.messages, i)?.text || '';
            return (
              <MessageBubble
                key={i}
                msg={msg}
                index={i}
                isGenerating={isGenerating}
                onRetry={handleRetry}
                onVariantChange={handleVariantChange}
                onEdit={handleEdit}
                onFullscreen={handleFullscreen}
                onCopyPrompt={handleCopyPrompt}
                onImageAction={handleImageAction}
                prompt={userPrompt}
              />
            );
          }

          return null;
        })}

        {showStream && retryingIdx < 0 && (
          <StreamBubble streamRef={streamRef} />
        )}
      </div>

      <div style={{ padding: '0 24px 16px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
        <InputBar
          ref={inputRef}
          placeholder="Continue creating..."
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={handleStopGeneration}
          providerId={config?.defaultProviderId || ''}
        />
      </div>
    </>
  );
}
