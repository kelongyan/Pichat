import test from 'node:test';
import assert from 'node:assert/strict';
import {
  imageSourceToBlob,
  inferImageMime,
  toImageDataUrl,
} from '../src/lib/imageSource.ts';

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8AARQAFlQH9WvyU4QAAAABJRU5ErkJggg==';

test('inferImageMime detects common base64 image signatures', () => {
  assert.equal(inferImageMime(tinyPngBase64), 'image/png');
  assert.equal(inferImageMime('/9j/abc'), 'image/jpeg');
  assert.equal(inferImageMime('UklGRabc'), 'image/webp');
});

test('toImageDataUrl preserves data URLs and wraps raw base64', () => {
  const dataUrl = `data:image/png;base64,${tinyPngBase64}`;

  assert.equal(toImageDataUrl(dataUrl), dataUrl);
  assert.equal(toImageDataUrl(tinyPngBase64), dataUrl);
});

test('imageSourceToBlob converts raw base64, data URLs and remote image URLs', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) !== 'https://cdn.example.test/image.png') {
      throw new Error('unexpected url');
    }
    return new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 });
  }) as typeof fetch;

  try {
    const rawBlob = await imageSourceToBlob(tinyPngBase64);
    const dataBlob = await imageSourceToBlob(`data:image/png;base64,${tinyPngBase64}`);
    const remoteBlob = await imageSourceToBlob('https://cdn.example.test/image.png');

    assert.equal(rawBlob.type, 'image/png');
    assert.equal(dataBlob.type, 'image/png');
    assert.equal(remoteBlob.type, 'image/png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
