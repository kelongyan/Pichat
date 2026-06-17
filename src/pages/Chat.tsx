import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { InputBarHandle, SendData } from '../components/InputBar';
import { useConfigStore, useConversationStore, generateId } from '../lib/store';
import type { Conversation } from '../types';
import { StreamBubble } from './StreamBubble';
import { MessageBubble } from './MessageBubble';
import { getReferenceImages, findPreviousUser } from './chatUtils';
import { useChatGeneration } from './useChatGeneration';
import styles from './Chat.module.css';

export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();

  const state = (location.state || {}) as {
    conversationId?: string;
    prompt?: string;
    generationPrompt?: string;
    size?: string;
    providerId?: string;
    images?: string[];
    autoSend?: boolean;
    forceNew?: boolean;
  };

  const config = useConfigStore((s) => s.config);
  const convStore = useConversationStore();
  const inputRef = useRef<InputBarHandle>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);
  const stateImagesAppliedRef = useRef(false);

  const [conversation, setConversation] = useState<Conversation | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const gen = useChatGeneration({
    conversation,
    setConversation,
    inputRef,
    scrollToBottom,
  });

  const clearAutoSendState = useCallback((conversationId: string) => {
    navigate(location.pathname, {
      replace: true,
      state: { conversationId },
    });
  }, [location.pathname, navigate]);

  // Load conversation on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let conv: Conversation | null = null;
      if (state.forceNew) {
        conv = { id: generateId(), createdAt: Date.now(), messages: [] };
      } else if (state.conversationId) {
        conv = await convStore.get(state.conversationId);
      }
      if (!conv) {
        conv = { id: generateId(), createdAt: Date.now(), messages: [] };
      }
      if (!cancelled) setConversation(conv);
    })();
    // Clear forceNew from location state so subsequent visits load normally
    if (state.forceNew) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abort any in-flight generation on unmount
  useEffect(() => () => { gen.abortRef.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // autoSend / apply state images
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
      void gen.handleSend({
        prompt: state.prompt,
        generationPrompt: state.generationPrompt,
        size: state.size || 'auto',
        providerId: state.providerId || config?.defaultProviderId || '',
        images: state.images || [],
      }, isNearBottom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearAutoSendState, conversation, config?.defaultProviderId, gen.handleSend]);

  const handleSend = useCallback((data: SendData) => {
    void gen.handleSend(data, isNearBottom);
  }, [gen, isNearBottom]);

  const handleRetry = useCallback((msgIdx: number) => {
    void gen.handleRetry(msgIdx, isNearBottom);
  }, [gen, isNearBottom]);

  return (
    <>
      <Header activeTab="create" showNewChat />
      <div className={styles.messages} ref={messagesRef}>
        {conversation?.messages.map((msg, i) => {
          if (msg.role === 'user') {
            const referenceImages = getReferenceImages(msg);
            return (
              <div key={i} className={`${styles.message} ${styles.messageUser}`}>
                <div className={styles.promptCard}>
                  <div className={styles.cardHeader}>
                    <span>Prompt</span>
                    {referenceImages.length > 0 && (
                      <span>{referenceImages.length === 1 ? 'Reference attached' : `${referenceImages.length} references attached`}</span>
                    )}
                  </div>
                  {referenceImages.length > 0 ? (
                    <div className={`${styles.promptCardBody} ${styles.promptCardBodyHasRef}`}>
                      <div className={styles.refThumbs}>
                        {referenceImages.map((src, idx) => (
                          <img
                            key={`${idx}-${src.slice(0, 24)}`}
                            src={src}
                            className={styles.refThumb}
                            alt=""
                          />
                        ))}
                      </div>
                      <div className={styles.promptText}>{msg.text}</div>
                    </div>
                  ) : (
                    <div className={styles.promptText}>{msg.text}</div>
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            if (gen.retryingIdx >= 0 && i === gen.retryingIdx && gen.showStream) {
              return (
                <div key={i}>
                  <StreamBubble streamRef={gen.streamRef} />
                </div>
              );
            }

            const userPrompt = findPreviousUser(conversation.messages, i)?.text || '';
            return (
              <MessageBubble
                key={i}
                msg={msg}
                index={i}
                isGenerating={gen.isGenerating}
                onRetry={handleRetry}
                onVariantChange={gen.handleVariantChange}
                onEdit={gen.handleEdit}
                onFullscreen={gen.handleFullscreen}
                onCopyPrompt={gen.handleCopyPrompt}
                onImageAction={gen.handleImageAction}
                prompt={userPrompt}
              />
            );
          }

          return null;
        })}

        {gen.showStream && gen.retryingIdx < 0 && (
          <StreamBubble streamRef={gen.streamRef} />
        )}
      </div>

      <div className={styles.inputWrapper}>
        <InputBar
          ref={inputRef}
          placeholder="Continue creating..."
          onSend={handleSend}
          isGenerating={gen.isGenerating}
          onStop={gen.handleStopGeneration}
          providerId={config?.defaultProviderId || ''}
        />
      </div>
    </>
  );
}
