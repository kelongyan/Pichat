import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { InputBarHandle, SendData } from '../components/InputBar';
import { ImageCard } from '../components/ImageCard';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { MarkdownRenderer } from '../lib/markdown';
import { generateImage } from '../lib/api';
import { saveImage } from '../lib/imageStore';
import { useConfigStore, useConversationStore, generateId } from '../lib/store';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Conversation, Message, Variant, ThinkingLevel } from '../types';

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

interface StreamState {
  text: string | null;
  thinking: string | null;
  imageBase64: string | null;
  done: boolean;
}

// Isolated streaming bubble — owns its own render cycle
function StreamBubble({ streamRef, showThinking }: { streamRef: React.RefObject<StreamState | null>; showThinking: boolean }) {
  const [state, setState] = useState<StreamState | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      const current = streamRef.current;
      setState((prev) => {
        if (!current) return prev ? null : prev;
        if (prev && prev.text === current.text && prev.thinking === current.thinking && prev.imageBase64 === current.imageBase64) return prev;
        return { ...current };
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [streamRef]);

  if (!state) return null;

  return (
    <div className="message message-ai">
      <div className="bubble-ai">
        {showThinking && state.thinking && (
          <details className="thinking-block" open>
            <summary className="thinking-summary">Thinking</summary>
            <div className="thinking-content">{state.thinking}</div>
          </details>
        )}
        {state.text && (
          <div className="bubble-ai-text markdown-body">
            <MarkdownRenderer content={state.text} />
          </div>
        )}
        {state.imageBase64 && (
          <img
            src={`data:image/png;base64,${state.imageBase64}`}
            alt=""
            style={{ maxWidth: 280, borderRadius: 'var(--radius-lg)', display: 'block', marginTop: 10 }}
          />
        )}
        {!state.text && !state.imageBase64 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 16 }}>
            <span className="loading-dot" /> Generating...
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
  showThinking,
  onRetry,
  onVariantChange,
  onEdit,
  onFullscreen,
}: {
  msg: Message;
  index: number;
  isGenerating: boolean;
  showThinking: boolean;
  onRetry: (idx: number) => void;
  onVariantChange: (idx: number, dir: -1 | 1) => void;
  onEdit: (src: string) => void;
  onFullscreen: (src: string, prompt: string) => void;
}) {
  const variant = getActiveVariant(msg);
  const variants = getVariants(msg);

  return (
    <div className="message message-ai">
      {msg.error ? (
        <div className="bubble-ai bubble-ai-error">{msg.error}</div>
      ) : variant ? (
        <div className="bubble-ai">
          {showThinking && variant.thinking && (
            <details className="thinking-block">
              <summary className="thinking-summary">Thinking</summary>
              <div className="thinking-content">{variant.thinking}</div>
            </details>
          )}
          {variant.text && (
            <div className="bubble-ai-text markdown-body" style={variant.imageBase64 || variant.imageId ? { marginBottom: 10 } : undefined}>
              <MarkdownRenderer content={variant.text} />
            </div>
          )}
          {(variant.imageId || variant.imageBase64) && (
            <ImageCard
              imageId={variant.imageId}
              imageBase64={variant.imageBase64}
              size={variant.size}
              prompt=""
              timestamp={variant.timestamp}
              onEdit={onEdit}
              onFullscreen={(src) => onFullscreen(src, '')}
            />
          )}
        </div>
      ) : null}

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
        </button>
      </div>
    </div>
  );
});

export default function Chat() {
  const location = useLocation();
  const { open: openLightbox } = useLightbox();
  const toast = useToast();

  const state = (location.state || {}) as {
    conversationId?: string;
    prompt?: string;
    size?: string;
    thinking?: string;
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
  const abortRef = useRef<AbortController | null>(null);

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
    if (state.images?.length && !autoSentRef.current) {
      inputRef.current?.setImages(state.images);
    }
    if (state.autoSend && state.prompt && !autoSentRef.current) {
      autoSentRef.current = true;
      handleSend({
        prompt: state.prompt,
        size: state.size || 'auto',
        thinking: state.thinking || 'low',
        images: state.images || [],
      });
    }
  }, [conversation]);

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

  async function handleSend(data: SendData) {
    if (isGenerating || !conversation) return;
    setIsGenerating(true);

    const updatedConv = { ...conversation };
    updatedConv.messages = [...updatedConv.messages, {
      role: 'user' as const,
      text: data.prompt,
      imageDataUrl: data.images?.length ? data.images[0] : undefined,
      timestamp: Date.now(),
    }];
    setConversation(updatedConv);
    await convStore.save(updatedConv);
    scrollToBottom();

    streamRef.current = { text: null, thinking: null, imageBase64: null, done: false };
    setShowStream(true);
    scrollToBottom();

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const historyMessages = updatedConv.messages.slice(0, -1);
      const result = await generateImage({
        prompt: data.prompt,
        size: data.size,
        thinking: data.thinking,
        action: 'auto',
        images: data.images || [],
        history: historyMessages,
        signal: ctrl.signal,
        onStream: (delta) => {
          streamRef.current = { text: delta.text, thinking: delta.thinking, imageBase64: delta.imageBase64, done: !!delta.done };
          if (isNearBottom()) scrollToBottom();
        },
      });

      let imageId: string | undefined;
      if (result.imageBase64) {
        imageId = await saveImage(result.imageBase64);
      }

      const finalConv = { ...updatedConv };
      finalConv.messages = [...finalConv.messages, {
        role: 'assistant' as const,
        variants: [{ text: result.text || undefined, imageId, thinking: result.thinking || undefined, size: data.size, timestamp: Date.now() }],
        activeVariant: 0,
        timestamp: Date.now(),
      }];
      setConversation(finalConv);
      await convStore.save(finalConv);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Generation failed';
      toast.show(message, { type: 'error' });
      const errConv = { ...updatedConv };
      errConv.messages = [...errConv.messages, {
        role: 'assistant' as const,
        error: message,
        timestamp: Date.now(),
      }];
      setConversation(errConv);
      await convStore.save(errConv);
    } finally {
      streamRef.current = null;
      setShowStream(false);
      setIsGenerating(false);
      scrollToBottom();
    }
  }

  async function handleRetry(msgIdx: number) {
    if (isGenerating || !conversation) return;
    const msg = conversation.messages[msgIdx];

    let userMsg: Message | null = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (conversation.messages[i].role === 'user') { userMsg = conversation.messages[i]; break; }
    }
    if (!userMsg) return;

    setIsGenerating(true);
    setRetryingIdx(msgIdx);

    streamRef.current = { text: null, thinking: null, imageBase64: null, done: false };
    setShowStream(true);
    scrollToBottom();

    try {
      const refImages = userMsg.imageDataUrl ? [userMsg.imageDataUrl] : [];
      const retrySize = getActiveVariant(msg)?.size || 'auto';
      const thinkingLevel = inputRef.current?.getThinking() || 'low';

      const historyMessages = conversation.messages.slice(0, msgIdx);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const result = await generateImage({
        prompt: userMsg.text || '',
        size: retrySize,
        thinking: thinkingLevel,
        action: 'auto',
        images: refImages,
        history: historyMessages,
        signal: ctrl.signal,
        onStream: (delta) => {
          streamRef.current = { text: delta.text, thinking: delta.thinking, imageBase64: delta.imageBase64, done: !!delta.done };
          if (isNearBottom()) scrollToBottom();
        },
      });

      let imageId: string | undefined;
      if (result.imageBase64) {
        imageId = await saveImage(result.imageBase64);
      }

      const updatedConv = { ...conversation };
      updatedConv.messages = [...updatedConv.messages];
      const updatedMsg = { ...updatedConv.messages[msgIdx] };

      if (updatedMsg.error) {
        updatedConv.messages[msgIdx] = {
          role: 'assistant',
          variants: [{ text: result.text || undefined, imageId, thinking: result.thinking || undefined, size: retrySize, timestamp: Date.now() }],
          activeVariant: 0,
          timestamp: Date.now(),
        };
      } else {
        const variants = [...getVariants(updatedMsg)];
        variants.push({ text: result.text || undefined, imageId, thinking: result.thinking || undefined, size: retrySize, timestamp: Date.now() });
        updatedMsg.variants = variants;
        updatedMsg.imageBase64 = undefined;
        updatedMsg.size = undefined;
        updatedMsg.activeVariant = variants.length - 1;
        updatedConv.messages[msgIdx] = updatedMsg;
      }
      setConversation(updatedConv);
      await convStore.save(updatedConv);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Retry failed';
      toast.show(message, { type: 'error' });
    } finally {
      setRetryingIdx(-1);
      streamRef.current = null;
      setShowStream(false);
      setIsGenerating(false);
      scrollToBottom();
    }
  }

  async function handleVariantChange(msgIdx: number, direction: -1 | 1) {
    if (!conversation) return;
    const updatedConv = { ...conversation };
    updatedConv.messages = [...updatedConv.messages];
    const msg = { ...updatedConv.messages[msgIdx] };
    const variants = getVariants(msg);
    const current = msg.activeVariant || 0;
    msg.activeVariant = Math.max(0, Math.min(variants.length - 1, current + direction));
    updatedConv.messages[msgIdx] = msg;
    setConversation(updatedConv);
    await convStore.save(updatedConv);
  }

  const handleEdit = useCallback((src: string) => {
    inputRef.current?.setImages([src]);
    inputRef.current?.textInput?.focus();
    toast.show('Reference image attached — describe your edits');
  }, [toast]);

  const handleFullscreen = useCallback((src: string, prompt: string) => {
    openLightbox(src, { prompt });
  }, [openLightbox]);

  return (
    <>
      <Header activeTab="create" showNewChat />
      <div className="chat-messages" ref={messagesRef}>
        {conversation?.messages.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={i} className="message message-user">
                <div className="bubble-user">
                  {msg.imageDataUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={msg.imageDataUrl} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} alt="" />
                      <span>{msg.text}</span>
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            if (retryingIdx >= 0 && i === retryingIdx && showStream) {
              return (
                <div key={i}>
                  <StreamBubble streamRef={streamRef} showThinking={!!config?.showThinking} />
                </div>
              );
            }

            return (
              <MessageBubble
                key={i}
                msg={msg}
                index={i}
                isGenerating={isGenerating}
                showThinking={!!config?.showThinking}
                onRetry={handleRetry}
                onVariantChange={handleVariantChange}
                onEdit={handleEdit}
                onFullscreen={handleFullscreen}
              />
            );
          }

          return null;
        })}

        {showStream && retryingIdx < 0 && (
          <StreamBubble streamRef={streamRef} showThinking={!!config?.showThinking} />
        )}
      </div>

      <div style={{ padding: '0 24px 16px' }}>
        <InputBar
          ref={inputRef}
          placeholder="Continue creating..."
          onSend={handleSend}
          initialThinking={(state.thinking as ThinkingLevel | undefined) || 'low'}
        />
      </div>
    </>
  );
}
