import { create } from 'zustand';
import type { Config, Conversation, GalleryImage, ProviderConfig } from '../types';
import { setDB, saveImage, deleteImage, IMAGES_STORE } from './imageStore';

const CONFIG_KEY = 'gpt2image_config';
const DB_NAME = 'gpt2image';
const DB_VERSION = 3;
const CONV_STORE = 'conversations';
const GALLERY_STORE = 'gallery_images';
const LEGACY_KEY = 'gpt2image_conversations';

let db: IDBDatabase | null = null;

interface GalleryIndexRecord extends GalleryImage {
  id: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(CONV_STORE)) {
        database.createObjectStore(CONV_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(IMAGES_STORE)) {
        database.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(GALLERY_STORE)) {
        const galleryStore = database.createObjectStore(GALLERY_STORE, { keyPath: 'id' });
        galleryStore.createIndex('timestamp', 'timestamp');
        galleryStore.createIndex('conversationId', 'conversationId');
      }
    };
    request.onsuccess = () => {
      db = request.result;
      setDB(db);
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

async function migrateFromLocalStorage() {
  if (!db) return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const convs = JSON.parse(raw);
    if (!Array.isArray(convs) || convs.length === 0) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    const tx = db.transaction(CONV_STORE, 'readwrite');
    const store = tx.objectStore(CONV_STORE);
    for (const conv of convs) {
      store.put(conv);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.warn('Migration from localStorage failed:', e);
  }
}

async function migrateImagesToBlobs() {
  if (!db) return;
  const tx = db.transaction(CONV_STORE, 'readonly');
  const store = tx.objectStore(CONV_STORE);
  const request = store.getAll();
  const convs = await new Promise<Conversation[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  for (const conv of convs) {
    let changed = false;
    for (const msg of conv.messages) {
      if (msg.role !== 'assistant') continue;
      if (msg.imageBase64 && !msg.variants?.length) {
        const imageId = await saveImage(msg.imageBase64);
        msg.variants = [{ imageId, size: msg.size || 'auto', timestamp: msg.timestamp }];
        msg.imageBase64 = undefined;
        msg.size = undefined;
        changed = true;
      }
      if (msg.variants) {
        for (const v of msg.variants) {
          if (v.imageBase64 && !v.imageId) {
            v.imageId = await saveImage(v.imageBase64);
            v.imageBase64 = undefined;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      const wtx = db!.transaction(CONV_STORE, 'readwrite');
      const wstore = wtx.objectStore(CONV_STORE);
      wstore.put(conv);
      await new Promise<void>((resolve, reject) => {
        wtx.oncomplete = () => resolve();
        wtx.onerror = () => reject(wtx.error);
      });
    }
  }
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

function toGalleryRecords(conv: Conversation): GalleryIndexRecord[] {
  return extractConversationImages(conv).map((image, index) => ({
    ...image,
    id: image.imageId || `${conv.id}:${image.timestamp}:${index}`,
  }));
}

function toGalleryImage(record: GalleryIndexRecord): GalleryImage {
  const { id: _id, ...image } = record;
  return image;
}

function extractImageIds(conv: Conversation): string[] {
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

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function syncGalleryForConversation(conv: Conversation): Promise<void> {
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

async function deleteGalleryForConversation(conversationId: string): Promise<void> {
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

async function ensureGalleryIndexBackfilled(): Promise<void> {
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

export async function initStore() {
  await openDB();
  await migrateFromLocalStorage();
  await migrateImagesToBlobs();
  await ensureGalleryIndexBackfilled();
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createProviderFromLegacy(parsed: Record<string, unknown>): ProviderConfig | null {
  const baseURL = typeof parsed.baseURL === 'string' ? parsed.baseURL.trim() : '';
  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  if (!baseURL || !apiKey) return null;
  const now = Date.now();
  return {
    id: typeof parsed.defaultProviderId === 'string' && parsed.defaultProviderId
      ? parsed.defaultProviderId
      : generateId(),
    name: 'Default',
    baseURL,
    apiKey,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : 'gpt-5.4',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeProvider(raw: unknown, index: number): ProviderConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const provider = raw as Record<string, unknown>;
  const baseURL = typeof provider.baseURL === 'string' ? provider.baseURL.trim() : '';
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
  if (!baseURL || !apiKey) return null;
  const now = Date.now();
  return {
    id: typeof provider.id === 'string' && provider.id ? provider.id : generateId(),
    name: typeof provider.name === 'string' && provider.name.trim()
      ? provider.name.trim()
      : `Provider ${index + 1}`,
    baseURL,
    apiKey,
    model: typeof provider.model === 'string' && provider.model.trim()
      ? provider.model.trim()
      : 'gpt-5.4',
    createdAt: typeof provider.createdAt === 'number' ? provider.createdAt : now,
    updatedAt: typeof provider.updatedAt === 'number' ? provider.updatedAt : now,
  };
}

function normalizeConfig(parsed: Record<string, unknown>): Config | null {
  const providers = Array.isArray(parsed.providers)
    ? parsed.providers
      .map((provider, index) => normalizeProvider(provider, index))
      .filter((provider): provider is ProviderConfig => !!provider)
    : [];

  if (providers.length === 0) {
    const legacyProvider = createProviderFromLegacy(parsed);
    if (legacyProvider) providers.push(legacyProvider);
  }

  if (providers.length === 0) return null;

  const requestedDefault = typeof parsed.defaultProviderId === 'string'
    ? parsed.defaultProviderId
    : '';
  const defaultProviderId = providers.some((provider) => provider.id === requestedDefault)
    ? requestedDefault
    : providers[0].id;

  return {
    providers,
    defaultProviderId,
    showThinking: typeof parsed.showThinking === 'boolean' ? parsed.showThinking : false,
    thinkingLevel: parsed.thinkingLevel === 'medium'
      || parsed.thinkingLevel === 'high'
      || parsed.thinkingLevel === 'xhigh'
      || parsed.thinkingLevel === 'low'
      ? parsed.thinkingLevel
      : 'low',
    darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : false,
    useSystemPrompt: typeof parsed.useSystemPrompt === 'boolean' ? parsed.useSystemPrompt : true,
  };
}

interface ConfigState {
  config: Config | null;
  loaded: boolean;
  load: () => void;
  save: (config: Config) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loaded: false,
  load: () => {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const config = normalizeConfig(parsed);
      if (!config) {
        set({ config: null, loaded: true });
        return;
      }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      set({
        config,
        loaded: true,
      });
    } else {
      set({ config: null, loaded: true });
    }
  },
  save: (config: Config) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    set({ config });
  },
}));

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
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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
