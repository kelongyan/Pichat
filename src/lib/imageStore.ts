import { generateId } from './store';

const IMAGES_STORE = 'images';
let db: IDBDatabase | null = null;

const urlCache = new Map<string, string>();
const thumbCache = new Map<string, string>();

export function setDB(database: IDBDatabase) {
  db = database;
}

function base64ToBlob(base64: string, mime = 'image/png'): Blob {
  const byteString = atob(base64);
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxEdge && height <= maxEdge) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(maxEdge / width, maxEdge / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = dataUrl;
  });
}

export { IMAGES_STORE };
