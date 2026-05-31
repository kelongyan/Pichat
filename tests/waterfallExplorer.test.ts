import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWaterfallPrompt,
  getExplorationSeed,
  orderWaterfallCards,
} from '../src/lib/waterfallExplorer.ts';

test('buildWaterfallPrompt leaves standard mode prompt untouched', () => {
  assert.equal(
    buildWaterfallPrompt('A quiet desert observatory', 'standard', 0),
    'A quiet desert observatory',
  );
});

test('buildWaterfallPrompt appends exploration seed in matrix mode', () => {
  const prompt = buildWaterfallPrompt('A quiet desert observatory', 'matrix', 1);

  assert.match(prompt, /^A quiet desert observatory/);
  assert.match(prompt, /Exploration direction:/);
  assert.match(prompt, /Style:/);
  assert.match(prompt, /Composition:/);
});

test('getExplorationSeed cycles through the matrix', () => {
  assert.equal(getExplorationSeed(0).label, getExplorationSeed(8).label);
  assert.notEqual(getExplorationSeed(0).label, getExplorationSeed(1).label);
});

test('orderWaterfallCards promotes pinned cards without losing original order', () => {
  const ordered = orderWaterfallCards([
    { id: 'a', pinned: false, createdAt: 1 },
    { id: 'b', pinned: true, createdAt: 2 },
    { id: 'c', pinned: true, createdAt: 3 },
    { id: 'd', pinned: false, createdAt: 4 },
  ]);

  assert.deepEqual(ordered.map((card) => card.id), ['b', 'c', 'a', 'd']);
});
