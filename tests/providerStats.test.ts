import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordProviderOutcome,
  summarizeProviderStats,
} from '../src/lib/providerStats.ts';

test('recordProviderOutcome updates totals, success rate and average duration', () => {
  const first = recordProviderOutcome({}, {
    providerId: 'p1',
    providerName: 'OpenAI',
    model: 'gpt-image',
    ok: true,
    durationMs: 1000,
    timestamp: 10,
  });
  const second = recordProviderOutcome(first, {
    providerId: 'p1',
    providerName: 'OpenAI',
    model: 'gpt-image',
    ok: false,
    durationMs: 3000,
    error: 'Rate limited',
    timestamp: 20,
  });

  assert.equal(second.p1.total, 2);
  assert.equal(second.p1.success, 1);
  assert.equal(second.p1.failure, 1);
  assert.equal(second.p1.avgDurationMs, 2000);
  assert.equal(second.p1.lastError, 'Rate limited');
});

test('summarizeProviderStats sorts active providers by newest update', () => {
  const summary = summarizeProviderStats({
    old: { providerId: 'old', providerName: 'Old', model: 'a', total: 1, success: 1, failure: 0, avgDurationMs: 100, updatedAt: 1 },
    fresh: { providerId: 'fresh', providerName: 'Fresh', model: 'b', total: 2, success: 1, failure: 1, avgDurationMs: 200, updatedAt: 2 },
  });

  assert.equal(summary[0].providerId, 'fresh');
  assert.equal(summary[0].successRate, 0.5);
});
