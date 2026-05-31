import type { Config, Conversation } from '../types';
import { collectConversationImageIds, remapConversationImageIds } from './dataTransferCore';
import { useConfigStore, useConversationStore } from './store';
import { getImageBase64, saveImage } from './imageStore';
import { loadGalleryMeta, saveGalleryMeta, type GalleryMetaMap } from './galleryMeta';
import {
  loadCustomPromptTemplates,
  saveCustomPromptTemplates,
  type PromptTemplate,
} from './promptTemplates';
import {
  loadProviderStats,
  saveProviderStats,
  type ProviderStatsMap,
} from './providerStats';

export interface PichatExportData {
  version: 1;
  exportedAt: number;
  config: Config | null;
  conversations: Conversation[];
  images: Record<string, string>;
  galleryMeta: GalleryMetaMap;
  promptTemplates: PromptTemplate[];
  providerStats: ProviderStatsMap;
}

export { collectConversationImageIds, remapConversationImageIds };

function cloneConversation(conversation: Conversation): Conversation {
  return JSON.parse(JSON.stringify(conversation)) as Conversation;
}

export async function exportPichatData(): Promise<PichatExportData> {
  const convStore = useConversationStore.getState();
  await convStore.loadAll();
  const conversations = useConversationStore.getState().conversations.map(cloneConversation);
  const images: Record<string, string> = {};
  for (const imageId of collectConversationImageIds(conversations)) {
    const base64 = await getImageBase64(imageId);
    if (base64) images[imageId] = base64;
  }
  return {
    version: 1,
    exportedAt: Date.now(),
    config: useConfigStore.getState().config,
    conversations,
    images,
    galleryMeta: loadGalleryMeta(),
    promptTemplates: loadCustomPromptTemplates(),
    providerStats: loadProviderStats(),
  };
}

export async function importPichatData(data: PichatExportData): Promise<void> {
  if (!data || data.version !== 1) {
    throw new Error('Unsupported Pichat export file');
  }

  const imageIdMap = new Map<string, string>();
  for (const [oldId, base64] of Object.entries(data.images || {})) {
    imageIdMap.set(oldId, await saveImage(base64));
  }

  const convStore = useConversationStore.getState();
  await convStore.loadAll();
  for (const conversation of useConversationStore.getState().conversations) {
    await convStore.remove(conversation.id);
  }
  for (const conversation of data.conversations || []) {
    await convStore.save(remapConversationImageIds(conversation, imageIdMap));
  }

  if (data.config) useConfigStore.getState().save(data.config);
  saveGalleryMeta(data.galleryMeta || {});
  saveCustomPromptTemplates(data.promptTemplates || []);
  saveProviderStats(data.providerStats || {});
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
