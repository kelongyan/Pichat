import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planGenerationAttempts,
  shouldParseStreamAsJson,
  shouldTryFallbackProtocol,
} from '../src/lib/generationStrategy.ts';

test('shouldTryFallbackProtocol never falls back for auth failures', () => {
  assert.equal(shouldTryFallbackProtocol({
    status: 401,
    endpoint: '/responses',
    action: 'auto',
    imageCount: 0,
  }), false);
  assert.equal(shouldTryFallbackProtocol({
    status: 403,
    endpoint: '/images/generations',
    action: 'auto',
    imageCount: 0,
  }), false);
});

test('shouldTryFallbackProtocol does not downgrade real image edits to Images API', () => {
  assert.equal(shouldTryFallbackProtocol({
    status: 404,
    endpoint: '/responses',
    action: 'edit',
    imageCount: 1,
  }), false);
});

test('shouldTryFallbackProtocol allows non-edit protocol mismatch recovery', () => {
  assert.equal(shouldTryFallbackProtocol({
    status: 404,
    endpoint: '/responses',
    action: 'auto',
    imageCount: 0,
  }), true);
  assert.equal(shouldTryFallbackProtocol({
    status: 400,
    endpoint: '/responses',
    action: 'auto',
    imageCount: 0,
  }), true);
  assert.equal(shouldTryFallbackProtocol({
    status: 404,
    endpoint: '/images/generations',
    action: 'auto',
    imageCount: 0,
  }), true);
});

test('shouldParseStreamAsJson detects non-streaming JSON responses to stream requests', () => {
  assert.equal(shouldParseStreamAsJson('application/json; charset=utf-8'), true);
  assert.equal(shouldParseStreamAsJson('application/problem+json'), true);
  assert.equal(shouldParseStreamAsJson('text/event-stream'), false);
});

test('planGenerationAttempts keeps reference image edits on Responses only', () => {
  const attempts = planGenerationAttempts({
    protocol: 'images',
    capabilities: { responses: true, images: true, streaming: true, editing: true },
    action: 'edit',
    imageCount: 1,
    wantsStream: true,
  });

  assert.deepEqual(attempts.map((attempt) => attempt.protocol), ['responses']);
  assert.equal(attempts[0].stream, true);
});

test('planGenerationAttempts prefers known available protocol and adds conservative fallback', () => {
  const attempts = planGenerationAttempts({
    protocol: 'responses',
    capabilities: { responses: false, images: true, streaming: false, editing: false },
    action: 'auto',
    imageCount: 0,
    wantsStream: true,
  });

  assert.deepEqual(attempts, [
    { protocol: 'images', stream: false, reason: 'capability' },
  ]);

  const unknown = planGenerationAttempts({
    protocol: 'responses',
    action: 'auto',
    imageCount: 0,
    wantsStream: false,
  });

  assert.deepEqual(unknown.map((attempt) => attempt.protocol), ['responses', 'images']);
});
