import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGalleryImageKey,
  filterGalleryImages,
  normalizeTags,
} from '../src/lib/galleryMeta.ts';
import type { GalleryImage } from '../src/types.ts';

const images: GalleryImage[] = [
  {
    id: 'img-a',
    imageId: 'blob-a',
    size: '1024x1024',
    prompt: 'Warm ceramic tea cup on linen',
    conversationId: 'conv-a',
    providerName: 'OpenAI',
    model: 'gpt-image',
    timestamp: 300,
  },
  {
    id: 'img-b',
    imageId: 'blob-b',
    size: '1536x1024',
    prompt: 'Cyberpunk street poster',
    conversationId: 'conv-b',
    providerName: 'Alt',
    model: 'gpt-image',
    timestamp: 200,
  },
  {
    size: 'auto',
    prompt: 'Quiet mountain wallpaper',
    conversationId: 'conv-c',
    timestamp: 100,
  },
];

test('normalizeTags trims, deduplicates and sorts tags', () => {
  assert.deepEqual(normalizeTags([' poster ', 'Poster', '', 'wallpaper', '  avatar']), [
    'avatar',
    'poster',
    'wallpaper',
  ]);
});

test('buildGalleryImageKey prefers stable ids and falls back to conversation data', () => {
  assert.equal(buildGalleryImageKey(images[0]), 'img-a');
  assert.equal(buildGalleryImageKey({ ...images[0], id: undefined }), 'blob-a');
  assert.equal(buildGalleryImageKey(images[2]), 'conv-c:100:Quiet mountain wallpaper');
});

test('filterGalleryImages searches metadata, tags, provider and favorites', () => {
  const meta = {
    'img-a': { favorite: true, tags: ['product', 'warm'] },
    'img-b': { favorite: false, tags: ['poster'] },
    'conv-c:100:Quiet mountain wallpaper': { favorite: true, tags: ['wallpaper'] },
  };

  assert.deepEqual(
    filterGalleryImages(images, { query: 'linen', favoriteOnly: false, provider: '', model: '', tag: '', sort: 'newest' }, meta)
      .map(buildGalleryImageKey),
    ['img-a'],
  );
  assert.deepEqual(
    filterGalleryImages(images, { query: '', favoriteOnly: true, provider: '', model: '', tag: '', sort: 'oldest' }, meta)
      .map(buildGalleryImageKey),
    ['conv-c:100:Quiet mountain wallpaper', 'img-a'],
  );
  assert.deepEqual(
    filterGalleryImages(images, { query: '', favoriteOnly: false, provider: 'Alt', model: '', tag: 'poster', sort: 'newest' }, meta)
      .map(buildGalleryImageKey),
    ['img-b'],
  );
});
