import { useCallback, useRef, useState } from 'react';
import { useLightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { generateImage, ApiError } from '../lib/api';
import { saveImage } from '../lib/imageStore';
import { useConfigStore, useConversationStore } from '../lib/store';
import { buildImageActionPrompt, type ImageAction } from '../lib/imageActions';
import { recordGenerationOutcome } from '../lib/providerStats';
import { copyToClipboard } from '../lib/clipboard';
import type { Conversation, Message, ProviderConfig, Variant } from '../types';
import type { InputBarHandle, SendData } from '../components/InputBar';
import { getReferenceImages } from './chatUtils';
import type { StreamState } from './chatUtils';

interface UseChatGenerationArgs {
  conversation: Conversation | null;
  setConversation: (conv: Conversation) => void;
  inputRef: React.RefObject<InputBarHandle | null>;
  scrollToBottom: () => void;
}

export function useChatGeneration({
  conversation,
  setConversation,
  inputRef,
  scrollToBottom,
}: UseChatGenerationArgs) {
  const config = useConfigStore((s) => s.config);
  const convStore = useConversationStore();
  const toast = useToast();
  const { open: openLightbox } = useLightbox();

  const [isGenerating, setIsGenerating] = useState(false);
  const [retryingIdx, setRetryingIdx] = useState(-1);
  const [showStream, setShowStream] = useState(false);
  const streamRef = useRef<StreamState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runGeneration = useCallback(async (args: {
    prompt: string;
    size?: string;
    providerId: string;
    provider: ProviderConfig | undefined;
    action: string;
    images: string[];
    history: Message[];
    errorTarget: Conversation;
    onNearBottom?: () => boolean;
  }): Promise<{ variant: Variant } | null> => {
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
          if (args.onNearBottom?.() ?? true) scrollToBottom();
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
      const toastAction = err instanceof ApiError && (err.errorType === 'auth' || err.errorType === 'not-found' || err.errorType === 'cors')
        ? { label: 'Go to Settings', onClick: () => { window.location.hash = '#/settings'; } }
        : undefined;
      toast.show(message, { type: 'error', action: toastAction });
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
  }, [convStore, isGenerating, scrollToBottom, toast, setConversation]);

  const handleSend = useCallback(async (data: SendData, onNearBottom?: () => boolean) => {
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
      onNearBottom,
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
  }, [config, conversation, convStore, isGenerating, runGeneration, scrollToBottom, inputRef, setConversation]);

  const handleStopGeneration = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    toast.show('Generation stopped');
  }, [toast]);

  const handleRetry = useCallback(async (msgIdx: number, onNearBottom?: () => boolean) => {
    if (isGenerating || !conversation) return;
    const msg = conversation.messages[msgIdx];

    let userMsg: Message | null = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (conversation.messages[i].role === 'user') { userMsg = conversation.messages[i]; break; }
    }
    if (!userMsg) return;

    setRetryingIdx(msgIdx);

    const refImages = getReferenceImages(userMsg);
    const activeVariant = msg.variants?.[msg.activeVariant || 0] || msg.variants?.[0] || null;
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
      onNearBottom,
    });

    if (!result) return;

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
      const variants = [...(updatedMsg.variants || []), result.variant];
      updatedMsg.variants = variants;
      updatedMsg.activeVariant = variants.length - 1;
      updatedConv.messages[msgIdx] = updatedMsg;
    }
    setConversation(updatedConv);
    await convStore.save(updatedConv);
  }, [config, conversation, convStore, isGenerating, runGeneration, inputRef, setConversation]);

  const handleVariantChange = useCallback((msgIdx: number, direction: -1 | 1) => {
    if (!conversation) return;
    const updatedConv = { ...conversation };
    updatedConv.messages = [...updatedConv.messages];
    const msg = { ...updatedConv.messages[msgIdx] };
    const variants = msg.variants || [];
    const current = msg.activeVariant || 0;
    msg.activeVariant = Math.max(0, Math.min(variants.length - 1, current + direction));
    updatedConv.messages[msgIdx] = msg;
    setConversation(updatedConv);
    void convStore.save(updatedConv);
  }, [conversation, convStore, setConversation]);

  const handleEdit = useCallback((src: string) => {
    inputRef.current?.setImages([src]);
    inputRef.current?.textInput?.focus();
  }, [inputRef]);

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
  }, [inputRef]);

  return {
    isGenerating,
    retryingIdx,
    showStream,
    streamRef,
    abortRef,
    handleSend,
    handleRetry,
    handleStopGeneration,
    handleVariantChange,
    handleEdit,
    handleFullscreen,
    handleCopyPrompt,
    handleImageAction,
  };
}
