import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGenerationPrompt,
  getUseCaseDefaults,
  normalizePromptStudioState,
} from '../src/lib/promptStudio.ts';

test('buildGenerationPrompt returns the trimmed prompt when studio settings are empty', () => {
  assert.equal(
    buildGenerationPrompt('  A quiet tea house at dawn  ', normalizePromptStudioState({})),
    'A quiet tea house at dawn',
  );
});

test('buildGenerationPrompt appends selected creative directions without rewriting the prompt', () => {
  const result = buildGenerationPrompt('A handmade ceramic lamp', normalizePromptStudioState({
    useCase: 'product',
    style: 'cinematic',
    shot: 'close',
    composition: 'centered',
    tone: 'warm',
    material: 'clay',
  }));

  assert.match(result, /^A handmade ceramic lamp/);
  assert.match(result, /Creative direction:/);
  assert.match(result, /Use case: product image/);
  assert.match(result, /Style: cinematic lighting/);
  assert.match(result, /Shot: close-up framing/);
  assert.match(result, /Composition: centered subject/);
  assert.match(result, /Tone: warm inviting palette/);
  assert.match(result, /Material: tactile clay\/ceramic finish/);
});

test('getUseCaseDefaults maps one-click modes to practical aspect defaults', () => {
  assert.deepEqual(getUseCaseDefaults('avatar'), { aspect: '1:1' });
  assert.deepEqual(getUseCaseDefaults('poster'), { aspect: 'vertical' });
  assert.deepEqual(getUseCaseDefaults('wallpaper'), { aspect: '16:9' });
  assert.deepEqual(getUseCaseDefaults('none'), {});
});

test('normalizePromptStudioState rejects unknown stored values', () => {
  assert.deepEqual(
    normalizePromptStudioState({
      useCase: 'unknown',
      style: 'watercolor',
      shot: 'alien-camera',
      composition: 'wide',
      tone: 'dramatic',
      material: 'liquid-metal',
    }),
    {
      useCase: 'none',
      style: 'watercolor',
      shot: 'none',
      composition: 'wide',
      tone: 'dramatic',
      material: 'none',
    },
  );
});
