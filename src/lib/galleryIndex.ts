import type { Conversation, GalleryImage } from '../types';
import { db, CONV_STORE, GALLERY_STORE, readRequest, waitForTx } from './db';

export interface GalleryIndexRecord extends GalleryImage {
  id: string;
}

function extractConversationImages(conv: Conversation): GalleryImage[] {
  const images: GalleryImage[] = [];
  for (let i = 0; i < conv.messages.length; i++) {
    const msg = conv.messages[i];
    if (msg.role !== 'assistant') continue;
    let prompt = '';
    for (let j = i - 1; j >= 0; j--) {
      if (conv.messages[j].role === 'user') { prompt = conv.messages[j].text || ''; break; }
    }
    const variants = msg.variants
      || (msg.variants === undefined && msg.imageBase64
        ? [{ imageBase64: msg.imageBase64, size: msg.size || 'auto', timestamp: msg.timestamp }]
        : []);
    for (const v of variants) {
      if (v.imageId || v.imageBase64) {
        images.push({
          imageId: v.imageId,
          imageBase64: v.imageId ? undefined : v.imageBase64,
          size: v.size || 'auto',
          prompt,
          conversationId: conv.id,
          providerId: v.providerId,
          providerName: v.providerName,
          model: v.model,
          timestamp: v.timestamp || msg.timestamp,
        });
      }
    }
  }
  return images;
}

export function toGalleryRecords(conv: Conversation): GalleryIndexRecord[] {
  return extractConversationImages(conv).map((image, index) => ({
    ...image,
    id: image.imageId || `${conv.id}:${image.timestamp}:${index}`,
  }));
}

export function toGalleryImage(record: GalleryIndexRecord): GalleryImage {
  const { id, ...image } = record;
  return { ...image, id };
}

export function extractImageIds(conv: Conversation): string[] {
  const ids = new Set<string>();
  for (const msg of conv.messages) {
    if (msg.role !== 'assistant') continue;
    if (msg.imageBase64) continue;
    for (const variant of msg.variants || []) {
      if (variant.imageId) ids.add(variant.imageId);
    }
  }
  return Array.from(ids);
}

export async function syncGalleryForConversation(conv: Conversation): Promise<void> {
  if (!db) return;
  const records = toGalleryRecords(conv);
  const tx = db.transaction(GALLERY_STORE, 'readwrite');
  const store = tx.objectStore(GALLERY_STORE);
  const index = store.index('conversationId');
  const cursorRequest = index.openCursor(IDBKeyRange.only(conv.id));

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) {
      for (const record of records) {
        store.put(record);
      }
      return;
    }
    cursor.delete();
    cursor.continue();
  };

  await waitForTx(tx);
}

export async function deleteGalleryForConversation(conversationId: string): Promise<void> {
  if (!db) return;
  const tx = db.transaction(GALLERY_STORE, 'readwrite');
  const store = tx.objectStore(GALLERY_STORE);
  const index = store.index('conversationId');
  const cursorRequest = index.openCursor(IDBKeyRange.only(conversationId));

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };

  await waitForTx(tx);
}

export async function ensureGalleryIndexBackfilled(): Promise<void> {
  if (!db) return;
  const countTx = db.transaction(GALLERY_STORE, 'readonly');
  const count = await readRequest(countTx.objectStore(GALLERY_STORE).count());
  await waitForTx(countTx);
  if (count > 0) return;

  const convTx = db.transaction(CONV_STORE, 'readonly');
  const convs = await readRequest<Conversation[]>(convTx.objectStore(CONV_STORE).getAll());
  await waitForTx(convTx);
  for (const conv of convs) {
    await syncGalleryForConversation(conv);
  }
}
