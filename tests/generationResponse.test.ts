import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeImagesResponse,
  normalizeResponsesResponse,
} from '../src/lib/protocols/generationResponse.ts';

test('normalizeResponsesResponse extracts text and image sources from Responses output', () => {
  const normalized = normalizeResponsesResponse({
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: 'first line' },
          { type: 'output_text', text: 'second line' },
          { type: 'output_image', image_base64: 'image-a' },
        ],
      },
      { type: 'image_generation_call', result: 'image-b' },
    ],
  });

  assert.equal(normalized.text, 'first line\nsecond line');
  assert.equal(normalized.imageSource, 'image-b');
});

test('normalizeResponsesResponse accepts final stream wrappers', () => {
  const normalized = normalizeResponsesResponse({
    response: {
      output: [
        { type: 'image_generation_call', b64_json: 'stream-image' },
      ],
    },
  });

  assert.equal(normalized.imageSource, 'stream-image');
});

test('normalizeImagesResponse extracts b64_json and URL image sources', () => {
  assert.deepEqual(
    normalizeImagesResponse({ data: [{ b64_json: 'raw-b64', revised_prompt: 'revised' }] }),
    { text: 'revised', imageSource: 'raw-b64' },
  );
  assert.deepEqual(
    normalizeImagesResponse({ data: [{ url: 'https://cdn.example.test/image.png' }] }),
    { text: null, imageSource: 'https://cdn.example.test/image.png' },
  );
});
