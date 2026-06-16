import { generateId } from './utils';

const IMAGES_STORE = 'images';
let db: IDBDatabase | null = null;

const urlCache = new Map<string, string>();
const thumbCache = new Map<string, string>();

export function setDB(database: IDBDatabase) {
  db = database;
}

function stripDataUrlPrefix(value: string): string {
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  return match ? match[2] : value;
}

function inferImageMime(value: string): string {
  const dataUrlMatch = value.match(/^data:([^;,]+)(?:;base64)?,/);
  if (dataUrlMatch?.[1]) return dataUrlMatch[1];

  const base64 = stripDataUrlPrefix(value);
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('PD94bWwg') || base64.startsWith('PHN2Zy')) return 'image/svg+xml';
  return 'image/png';
}

export function toImageDataUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  return `data:${inferImageMime(value)};base64,${stripDataUrlPrefix(value)}`;
}

function base64ToBlob(base64: string, mime = inferImageMime(base64)): Blob {
  const normalized = stripDataUrlPrefix(base64);
  const byteString = atob(normalized);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

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
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
}

export async function saveImage(base64: string): Promise<string> {
  if (!db) throw new Error('DB not initialized');
  const id = generateId();
  const blob = base64ToBlob(base64);
  const thumbBlob = await generateThumbnail(blob);

  const tx = db.transaction(IMAGES_STORE, 'readwrite');
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

export async function getImageURL(id: string): Promise<string> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  if (!db) throw new Error('DB not initialized');
  const tx = db.transaction(IMAGES_STORE, 'readonly');
  const store = tx.objectStore(IMAGES_STORE);
  const request = store.get(id);
  const record = await new Promise<{ blob: Blob; thumbBlob: Blob } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!record) return '';
  const url = URL.createObjectURL(record.blob);
  urlCache.set(id, url);
  if (!thumbCache.has(id)) {
    thumbCache.set(id, URL.createObjectURL(record.thumbBlob));
  }
  return url;
}

export async function getThumbURL(id: string): Promise<string> {
  if (thumbCache.has(id)) return thumbCache.get(id)!;
  if (!db) throw new Error('DB not initialized');
  const tx = db.transaction(IMAGES_STORE, 'readonly');
  const store = tx.objectStore(IMAGES_STORE);
  const request = store.get(id);
  const record = await new Promise<{ blob: Blob; thumbBlob: Blob } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!record) return '';
  const thumbUrl = URL.createObjectURL(record.thumbBlob);
  thumbCache.set(id, thumbUrl);
  if (!urlCache.has(id)) {
    urlCache.set(id, URL.createObjectURL(record.blob));
  }
  return thumbUrl;
}

export async function getImageBase64(id: string): Promise<string> {
  if (!db) throw new Error('DB not initialized');
  const tx = db.transaction(IMAGES_STORE, 'readonly');
  const store = tx.objectStore(IMAGES_STORE);
  const request = store.get(id);
  const record = await new Promise<{ blob: Blob } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!record) return '';
  return blobToBase64(record.blob);
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  if (!db) return null;
  const tx = db.transaction(IMAGES_STORE, 'readonly');
  const store = tx.objectStore(IMAGES_STORE);
  const request = store.get(id);
  const record = await new Promise<{ blob: Blob } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return record?.blob ?? null;
}

export async function deleteImage(id: string): Promise<void> {
  if (!db) return;
  const tx = db.transaction(IMAGES_STORE, 'readwrite');
  const store = tx.objectStore(IMAGES_STORE);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (urlCache.has(id)) {
    URL.revokeObjectURL(urlCache.get(id)!);
    urlCache.delete(id);
  }
  if (thumbCache.has(id)) {
    URL.revokeObjectURL(thumbCache.get(id)!);
    thumbCache.delete(id);
  }
}

export function revokeAll() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  for (const url of thumbCache.values()) URL.revokeObjectURL(url);
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
