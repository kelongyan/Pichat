import { getDB } from './db';
import { imageSourceToBlob, toImageDataUrl } from './imageSource.ts';
import { generateId } from './utils';

const IMAGES_STORE = 'images';

const URL_CACHE_MAX = 150;

/** LRU cache for object URLs. Evicts oldest entries when capacity exceeded. */
class LruUrlCache {
  private map = new Map<string, string>();

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Move to end (most recently used) by re-inserting.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    this.evict();
  }

  delete(key: string): void {
    const value = this.map.get(key);
    if (value !== undefined) {
      URL.revokeObjectURL(value);
      this.map.delete(key);
    }
  }

  clear(): void {
    for (const value of this.map.values()) URL.revokeObjectURL(value);
    this.map.clear();
  }

  private evict(): void {
    while (this.map.size > URL_CACHE_MAX) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const key = oldest.value;
      const value = this.map.get(key);
      if (value !== undefined) URL.revokeObjectURL(value);
      this.map.delete(key);
    }
  }
}

const urlCache = new LruUrlCache();
const thumbCache = new LruUrlCache();

/** In-flight promise dedup: same imageId concurrent requests share one DB read. */
const inflightFull = new Map<string, Promise<string>>();
const inflightThumb = new Map<string, Promise<string>>();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Whether canvas.convertToBlob supports WebP output. Detected once at first use. */
let webpSupported: boolean | null = null;
async function supportsWebp(): Promise<boolean> {
  if (webpSupported !== null) return webpSupported;
  try {
    const test = new OffscreenCanvas(1, 1);
    const blob = await test.convertToBlob({ type: 'image/webp' });
    webpSupported = blob.type === 'image/webp';
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

async function generateThumbnail(blob: Blob, maxSize = 200): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  let tw = width;
  let th = height;
  if (width > maxSize || height > maxSize) {
    const scale = Math.min(maxSize / width, maxSize / height);
    tw = Math.round(width * scale);
    th = Math.round(height * scale);
  }

  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  bitmap.close();
  // Prefer WebP for smaller thumbnails (~25-35% smaller than JPEG at equal quality).
  const useWebp = await supportsWebp();
  return canvas.convertToBlob({ type: useWebp ? 'image/webp' : 'image/jpeg', quality: 0.72 });
}

export async function saveImage(source: string): Promise<string> {
  const database = getDB();
  if (!database) throw new Error('DB not initialized');
  const id = generateId();
  const blob = await imageSourceToBlob(source);
  const thumbBlob = await generateThumbnail(blob);

  const tx = database.transaction(IMAGES_STORE, 'readwrite');
  const store = tx.objectStore(IMAGES_STORE);
  store.put({ id, blob, thumbBlob });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  const thumbUrl = URL.createObjectURL(thumbBlob);
  thumbCache.set(id, thumbUrl);

  return id;
}

function readImageRecord(id: string): Promise<{ blob: Blob; thumbBlob: Blob } | undefined> {
  const database = getDB();
  if (!database) return Promise.resolve(undefined);
  const tx = database.transaction(IMAGES_STORE, 'readonly');
  const store = tx.objectStore(IMAGES_STORE);
  const request = store.get(id);
  return new Promise<{ blob: Blob; thumbBlob: Blob } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getImageURL(id: string): Promise<string> {
  const cached = urlCache.get(id);
  if (cached !== undefined) return cached;

  const existing = inflightFull.get(id);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const record = await readImageRecord(id);
      if (!record) return '';
      const url = URL.createObjectURL(record.blob);
      urlCache.set(id, url);
      if (!thumbCache.has(id)) {
        thumbCache.set(id, URL.createObjectURL(record.thumbBlob));
      }
      return url;
    } finally {
      inflightFull.delete(id);
    }
  })();

  inflightFull.set(id, promise);
  return promise;
}

export async function getThumbURL(id: string): Promise<string> {
  const cached = thumbCache.get(id);
  if (cached !== undefined) return cached;

  const existing = inflightThumb.get(id);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const record = await readImageRecord(id);
      if (!record) return '';
      const thumbUrl = URL.createObjectURL(record.thumbBlob);
      thumbCache.set(id, thumbUrl);
      if (!urlCache.has(id)) {
        urlCache.set(id, URL.createObjectURL(record.blob));
      }
      return thumbUrl;
    } finally {
      inflightThumb.delete(id);
    }
  })();

  inflightThumb.set(id, promise);
  return promise;
}

export async function getImageBase64(id: string): Promise<string> {
  const record = await readImageRecord(id);
  if (!record) return '';
  return blobToBase64(record.blob);
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const record = await readImageRecord(id);
  return record?.blob ?? null;
}

export async function deleteImage(id: string): Promise<void> {
  const database = getDB();
  if (!database) return;
  // Cancel any in-flight reads so we don't re-cache a deleted record.
  inflightFull.delete(id);
  inflightThumb.delete(id);

  const tx = database.transaction(IMAGES_STORE, 'readwrite');
  const store = tx.objectStore(IMAGES_STORE);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  urlCache.delete(id);
  thumbCache.delete(id);
}

export function revokeAll() {
  urlCache.clear();
  thumbCache.clear();
}

export async function compressImage(dataUrl: string, maxEdge = 2048, quality = 0.85): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  if (width <= maxEdge && height <= maxEdge) {
    bitmap.close();
    return dataUrl;
  }

  const scale = Math.min(maxEdge / width, maxEdge / height);
  const tw = Math.round(width * scale);
  const th = Math.round(height * scale);

  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  bitmap.close();

  const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(resultBlob);
  });
}

export { IMAGES_STORE };
export { toImageDataUrl };
