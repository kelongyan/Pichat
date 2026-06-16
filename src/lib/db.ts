import type { Conversation } from '../types';
import { setDB, saveImage, IMAGES_STORE } from './imageStore';

export const DB_NAME = 'gpt2image';
export const DB_VERSION = 3;
export const CONV_STORE = 'conversations';
export const GALLERY_STORE = 'gallery_images';
const LEGACY_KEY = 'gpt2image_conversations';

export let db: IDBDatabase | null = null;

export function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function waitForTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
    await waitForTx(tx);
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
  const convs = await readRequest<Conversation[]>(request);

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
      await waitForTx(wtx);
    }
  }
}

export async function initStore(
  backfillGallery: () => Promise<void>,
) {
  await openDB();
  await migrateFromLocalStorage();
  await migrateImagesToBlobs();
  await backfillGallery();
}
