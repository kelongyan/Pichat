import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASPECT_OPTIONS,
  resolveImageSize,
} from '../src/lib/imagePresets.ts';

test('resolveImageSize maps aspect and resolution to API size strings', () => {
  assert.equal(resolveImageSize('auto', 'standard'), 'auto');
  assert.equal(resolveImageSize('1:1', 'standard'), '1024x1024');
  assert.equal(resolveImageSize('16:9', '2k'), '2560x1440');
  assert.equal(resolveImageSize('4:3', 'hd'), '1600x1200');
  assert.equal(resolveImageSize('wide', 'standard'), '1536x1024');
  assert.equal(resolveImageSize('vertical', '2k'), '1440x2560');
});

test('aspect options remove vertical numeric ratios and add wide and vertical shortcuts', () => {
  const values = ASPECT_OPTIONS.map((option) => option.value);

  assert.deepEqual(values, ['auto', '1:1', '16:9', '4:3', 'wide', 'vertical', 'custom']);
  assert.equal(ASPECT_OPTIONS.find((option) => option.value === 'wide')?.label, '宽屏');
  assert.equal(ASPECT_OPTIONS.find((option) => option.value === 'vertical')?.label, '竖屏');
});
