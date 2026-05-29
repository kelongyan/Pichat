import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyQuickPresetToPrompt,
  getQuickPresetDefaults,
  resolveImageSize,
} from '../src/lib/imagePresets.ts';

test('resolveImageSize maps aspect and resolution to API size strings', () => {
  assert.equal(resolveImageSize('auto', 'standard'), 'auto');
  assert.equal(resolveImageSize('1:1', 'standard'), '1024x1024');
  assert.equal(resolveImageSize('16:9', '2k'), '2560x1440');
  assert.equal(resolveImageSize('9:16', '4k'), '2160x3840');
  assert.equal(resolveImageSize('4:3', 'hd'), '1600x1200');
  assert.equal(resolveImageSize('3:4', '2k'), '1536x2048');
});

test('getQuickPresetDefaults returns useful aspect defaults', () => {
  assert.deepEqual(getQuickPresetDefaults('none'), {});
  assert.deepEqual(getQuickPresetDefaults('avatar-circle'), { aspect: '1:1' });
  assert.deepEqual(getQuickPresetDefaults('avatar-square'), { aspect: '1:1' });
  assert.deepEqual(getQuickPresetDefaults('landscape'), { aspect: '16:9' });
  assert.deepEqual(getQuickPresetDefaults('portrait'), { aspect: '9:16' });
});

test('applyQuickPresetToPrompt adds targeted instructions without changing empty preset prompts', () => {
  const prompt = 'A watercolor portrait of a calm engineer';

  assert.equal(applyQuickPresetToPrompt(prompt, 'none'), prompt);

  const circular = applyQuickPresetToPrompt(prompt, 'avatar-circle');
  assert.match(circular, /watercolor portrait/);
  assert.match(circular, /circular profile avatar/i);
  assert.match(circular, /no text/i);

  const landscape = applyQuickPresetToPrompt(prompt, 'landscape');
  assert.match(landscape, /wide horizontal composition/i);
});
