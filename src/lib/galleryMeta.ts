import type { GalleryImage } from '../types';
import { canUseStorage } from './storage';

const GALLERY_META_STORAGE_KEY = 'pichat_gallery_meta';

interface GalleryMetaEntry {
  favorite?: boolean;
  tags?: string[];
}

export type GalleryMetaMap = Record<string, GalleryMetaEntry>;

export interface GalleryFilterState {
  query: string;
  favoriteOnly: boolean;
  provider: string;
  model: string;
  tag: string;
  sort: 'newest' | 'oldest';
}

export function normalizeTags(tags: string[]): string[] {
  const normalized = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (value) normalized.add(value);
  }
  return Array.from(normalized).sort((a, b) => a.localeCompare(b));
}

export function buildGalleryImageKey(image: GalleryImage): string {
  return image.id || image.imageId || `${image.conversationId}:${image.timestamp}:${image.prompt}`;
}

export function normalizeGalleryMetaEntry(raw: unknown): GalleryMetaEntry {
  if (!raw || typeof raw !== 'object') return {};
  const entry = raw as Record<string, unknown>;
  return {
    favorite: entry.favorite === true,
    tags: Array.isArray(entry.tags) ? normalizeTags(entry.tags.filter((tag): tag is string => typeof tag === 'string')) : [],
  };
}

export function normalizeGalleryMetaMap(raw: unknown): GalleryMetaMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: GalleryMetaMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = normalizeGalleryMetaEntry(value);
  }
  return out;
}

export function loadGalleryMeta(): GalleryMetaMap {
  if (!canUseStorage()) return {};
  try {
    return normalizeGalleryMetaMap(JSON.parse(window.localStorage.getItem(GALLERY_META_STORAGE_KEY) || '{}'));
  } catch {
    return {};
  }
}

export function saveGalleryMeta(meta: GalleryMetaMap): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(GALLERY_META_STORAGE_KEY, JSON.stringify(normalizeGalleryMetaMap(meta)));
  } catch {
    // quota / private mode — ignore write failure
  }
}

export function toggleGalleryFavorite(meta: GalleryMetaMap, key: string): GalleryMetaMap {
  const current = normalizeGalleryMetaEntry(meta[key]);
  return {
    ...meta,
    [key]: {
      ...current,
      favorite: !current.favorite,
    },
  };
}

export function setGalleryTags(meta: GalleryMetaMap, key: string, tags: string[]): GalleryMetaMap {
  return {
    ...meta,
    [key]: {
      ...normalizeGalleryMetaEntry(meta[key]),
      tags: normalizeTags(tags),
    },
  };
}

export function getAllGalleryTags(meta: GalleryMetaMap): string[] {
  const tags = new Set<string>();
  for (const entry of Object.values(meta)) {
    for (const tag of entry.tags || []) tags.add(tag);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function getGalleryProviders(images: GalleryImage[]): string[] {
  const providers = new Set<string>();
  for (const image of images) {
    if (image.providerName) providers.add(image.providerName);
  }
  return Array.from(providers).sort((a, b) => a.localeCompare(b));
}

export function getGalleryModels(images: GalleryImage[]): string[] {
  const models = new Set<string>();
  for (const image of images) {
    if (image.model) models.add(image.model);
  }
  return Array.from(models).sort((a, b) => a.localeCompare(b));
}

export function filterGalleryImages(
  images: GalleryImage[],
  filters: GalleryFilterState,
  meta: GalleryMetaMap,
): GalleryImage[] {
  const query = filters.query.trim().toLowerCase();
  const tag = filters.tag.trim().toLowerCase();
  const provider = filters.provider.trim().toLowerCase();
  const model = filters.model.trim().toLowerCase();

  return images
    .filter((image) => {
      const key = buildGalleryImageKey(image);
      const entry = normalizeGalleryMetaEntry(meta[key]);
      const tags = entry.tags || [];
      const haystack = [
        image.prompt,
        image.size,
        image.providerName,
        image.model,
        ...tags,
      ].filter(Boolean).join(' ').toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (filters.favoriteOnly && !entry.favorite) return false;
      if (tag && !tags.includes(tag)) return false;
      if (provider && (image.providerName || '').toLowerCase() !== provider) return false;
      if (model && (image.model || '').toLowerCase() !== model) return false;
      return true;
    })
    .sort((a, b) => (
      filters.sort === 'oldest'
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    ));
}
