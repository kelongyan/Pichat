import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPromptTemplate,
  normalizePromptTemplate,
  normalizePromptTemplates,
} from '../src/lib/promptTemplates.ts';

test('applyPromptTemplate replaces prompt placeholder', () => {
  assert.equal(
    applyPromptTemplate('a glass perfume bottle', {
      id: 'product',
      name: 'Product',
      template: 'Premium product photo of {prompt}, soft shadows',
      createdAt: 1,
      updatedAt: 1,
      builtin: true,
    }),
    'Premium product photo of a glass perfume bottle, soft shadows',
  );
});

test('applyPromptTemplate appends templates without placeholder', () => {
  assert.equal(
    applyPromptTemplate('a tiny cabin', {
      id: 'suffix',
      name: 'Suffix',
      template: 'Use a cozy editorial illustration style.',
      createdAt: 1,
      updatedAt: 1,
    }),
    'a tiny cabin\n\nUse a cozy editorial illustration style.',
  );
});

test('normalizePromptTemplate fills safe defaults', () => {
  const normalized = normalizePromptTemplate({ id: '', name: '  ', template: '  {prompt} in ink  ' }, 10);

  assert.equal(normalized.id.length > 0, true);
  assert.equal(normalized.name, 'Untitled Template');
  assert.equal(normalized.template, '{prompt} in ink');
  assert.equal(normalized.createdAt, 10);
  assert.equal(normalized.updatedAt, 10);
});

test('normalizePromptTemplates removes unusable templates', () => {
  const normalized = normalizePromptTemplates([
    { id: 'a', name: 'A', template: ' {prompt} ' },
    { id: 'b', name: 'B', template: '   ' },
  ], 20);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'a');
});
