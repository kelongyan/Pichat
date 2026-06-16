import type { Message, StreamStage, Variant } from '../types';

export interface StreamState {
  text: string | null;
  imageBase64: string | null;
  done: boolean;
  stage: StreamStage | null;
  startedAt: number;
}

export interface PhaseRecord {
  phase: string;
  startedAt: number;
  endedAt?: number;
}

export const PHASES = [
  { key: 'generating' as const, label: 'Generating' },
];

export function getVariants(msg: Message): Variant[] {
  if (msg.variants) return msg.variants;
  if (msg.imageBase64) return [{ imageBase64: msg.imageBase64, size: msg.size || 'auto', timestamp: msg.timestamp }];
  return [];
}

export function getActiveVariant(msg: Message): Variant | null {
  const variants = getVariants(msg);
  const idx = msg.activeVariant || 0;
  return variants[idx] || variants[0] || null;
}

export function getReferenceImages(msg: Message): string[] {
  if (msg.imageDataUrls?.length) return msg.imageDataUrls;
  return msg.imageDataUrl ? [msg.imageDataUrl] : [];
}

export function findPreviousUser(messages: Message[], fromIndex: number): Message | null {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i];
  }
  return null;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}
