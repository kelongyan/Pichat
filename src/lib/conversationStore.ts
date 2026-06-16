import { create } from 'zustand';
import type { Conversation, GalleryImage } from '../types';
import { deleteImage } from './imageStore';
import { db, CONV_STORE, GALLERY_STORE, readRequest, waitForTx } from './db';
import {
  syncGalleryForConversation,
  deleteGalleryForConversation,
  extractImageIds,
  toGalleryImage,
  type GalleryIndexRecord,
} from './galleryIndex';

interface ConversationState {
  conversations: Conversation[];
  loading: boolean;
  loadAll: () => Promise<void>;
  get: (id: string) => Promise<Conversation | null>;
  save: (conversation: Conversation) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getAllImages: () => Promise<GalleryImage[]>;
  getRecentImages: (limit: number) => Promise<GalleryImage[]>;
  getImagePage: (cursor: string | null, pageSize: number) => Promise<{ images: GalleryImage[]; nextCursor: string | null }>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  loading: false,
  loadAll: async () => {
    if (!db) return;
    set({ loading: true });
    const tx = db.transaction(CONV_STORE, 'readonly');
    const store = tx.objectStore(CONV_STORE);
    const request = store.getAll();
    const result = await new Promise<Conversation[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result.sort((a: Conversation, b: Conversation) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
    set({ conversations: result, loading: false });
  },
  get: async (id: string) => {
    if (!db) return null;
    const tx = db.transaction(CONV_STORE, 'readonly');
    const store = tx.objectStore(CONV_STORE);
    const request = store.get(id);
    return new Promise<Conversation | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },
  save: async (conversation: Conversation) => {
    if (!db) return;
    const tx = db.transaction(CONV_STORE, 'readwrite');
    const store = tx.objectStore(CONV_STORE);
    store.put(conversation);
    await waitForTx(tx);
    await syncGalleryForConversation(conversation);
    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === conversation.id);
      if (idx >= 0) {
        const updated = [...state.conversations];
        updated[idx] = conversation;
        return { conversations: updated };
      }
      return { conversations: [conversation, ...state.conversations] };
    });
  },
  remove: async (id: string) => {
    if (!db) return;
    const existing = await get().get(id);
    const imageIds = existing ? extractImageIds(existing) : [];

    const tx = db.transaction(CONV_STORE, 'readwrite');
    const store = tx.objectStore(CONV_STORE);
    store.delete(id);
    await waitForTx(tx);
    await deleteGalleryForConversation(id);
    await Promise.all(imageIds.map((imageId) => deleteImage(imageId)));
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    }));
  },
  getAllImages: async () => {
    if (!db) return [];
    const tx = db.transaction(GALLERY_STORE, 'readonly');
    const records = await readRequest<GalleryIndexRecord[]>(tx.objectStore(GALLERY_STORE).getAll());
    await waitForTx(tx);
    return records
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(toGalleryImage);
  },
  getRecentImages: async (limit: number) => {
    if (!db || limit <= 0) return [];
    return new Promise((resolve, reject) => {
      const images: GalleryImage[] = [];
      const tx = db!.transaction(GALLERY_STORE, 'readonly');
      const index = tx.objectStore(GALLERY_STORE).index('timestamp');
      const request = index.openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || images.length >= limit) {
          resolve(images);
          return;
        }
        images.push(toGalleryImage(cursor.value as GalleryIndexRecord));
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  },
  getImagePage: async (cursor: string | null, pageSize: number) => {
    if (!db || pageSize <= 0) return { images: [], nextCursor: null };
    let foundCursor = !cursor;

    return new Promise<{ images: GalleryImage[]; nextCursor: string | null }>((resolve, reject) => {
      const collected: GalleryIndexRecord[] = [];
      const tx = db!.transaction(GALLERY_STORE, 'readonly');
      const index = tx.objectStore(GALLERY_STORE).index('timestamp');
      const request = index.openCursor(null, 'prev');
      request.onsuccess = () => {
        const c = request.result;
        if (!c) {
          resolve({ images: collected.map(toGalleryImage), nextCursor: null });
          return;
        }
        const record = c.value as GalleryIndexRecord;
        if (!foundCursor) {
          if (record.id === cursor) foundCursor = true;
          c.continue();
          return;
        }
        collected.push(record);
        if (collected.length > pageSize) {
          const page = collected.slice(0, pageSize);
          resolve({
            images: page.map(toGalleryImage),
            nextCursor: page[page.length - 1]?.id ?? null,
          });
          return;
        }
        c.continue();
      };
      request.onerror = () => reject(request.error);
    });
  },
}));
