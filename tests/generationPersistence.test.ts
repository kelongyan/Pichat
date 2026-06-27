import test from 'node:test';
import assert from 'node:assert/strict';
import { persistGeneratedImage } from '../src/pages/generationPersistence.ts';

test('persistGeneratedImage returns an image id when local storage succeeds', async () => {
  const result = await persistGeneratedImage('base64-image', async () => 'img-1');

  assert.deepEqual(result, { imageId: 'img-1' });
});

test('persistGeneratedImage keeps the original image source when local storage fails', async () => {
  const result = await persistGeneratedImage('https://cdn.example.test/image.png', async () => {
    throw new Error('CORS');
  });

  assert.equal(result.imageId, undefined);
  assert.equal(result.imageBase64, 'https://cdn.example.test/image.png');
  assert.equal(result.persistError, 'CORS');
});

test('persistGeneratedImage ignores empty image sources', async () => {
  const result = await persistGeneratedImage(null, async () => 'never');

  assert.deepEqual(result, {});
});
