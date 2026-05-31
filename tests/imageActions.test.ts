import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImageActionPrompt,
  getImageActionLabel,
} from '../src/lib/imageActions.ts';

test('buildImageActionPrompt keeps the original prompt visible for same-direction variants', () => {
  const prompt = buildImageActionPrompt('same', 'A forest shrine in rain');

  assert.match(prompt, /Create another variation/);
  assert.match(prompt, /A forest shrine in rain/);
  assert.match(prompt, /Keep the strongest visual idea/);
});

test('buildImageActionPrompt creates focused editing prompts for common image actions', () => {
  assert.match(buildImageActionPrompt('style', 'A portrait'), /Use the attached image as a style reference/);
  assert.match(buildImageActionPrompt('background', 'A portrait'), /Change the background/);
  assert.match(buildImageActionPrompt('ratio', 'A portrait'), /Recompose this image for a new aspect ratio/);
  assert.match(buildImageActionPrompt('realistic', 'A portrait'), /more photorealistic/);
  assert.match(buildImageActionPrompt('cinematic', 'A portrait'), /more cinematic/);
});

test('getImageActionLabel returns short UI labels', () => {
  assert.equal(getImageActionLabel('copy'), 'Copy');
  assert.equal(getImageActionLabel('same'), 'Same');
  assert.equal(getImageActionLabel('background'), 'Background');
});
