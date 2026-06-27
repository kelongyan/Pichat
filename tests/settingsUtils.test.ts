import test from 'node:test';
import assert from 'node:assert/strict';
import { testProviderConnection } from '../src/lib/settingsUtils.ts';
import type { ProviderConfig } from '../src/types.ts';

const provider: ProviderConfig = {
  id: 'futureppo',
  name: 'FuturePPO',
  baseURL: 'https://api.example.test',
  apiKey: 'test-key',
  model: 'gpt-image-2',
  createdAt: 1,
  updatedAt: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function htmlResponse(): Response {
  return new Response('<!doctype html><html><body>NewAPI console</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

test('testProviderConnection ignores HTML root pages and detects a /v1 API base', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.startsWith('https://api.example.test/v1/')) {
      if (url.endsWith('/models')) {
        return jsonResponse({ data: [{ id: 'gpt-image-2' }] });
      }
      if (url.endsWith('/responses')) {
        return jsonResponse({ error: { message: 'missing input' } }, 400);
      }
      return jsonResponse({ error: { message: 'not found' } }, 404);
    }

    return htmlResponse();
  }) as typeof fetch;

  try {
    const result = await testProviderConnection(provider);

    assert.equal(result.baseURL, 'https://api.example.test/v1');
    assert.equal(result.protocol, 'responses');
    assert.equal(result.authOk, true);
    assert.equal(result.reachable, true);
    assert.deepEqual(result.capabilities, {
      responses: true,
      images: false,
      streaming: true,
      editing: true,
      authOk: true,
      reachable: true,
      checkedAt: result.capabilities.checkedAt,
    });
    assert.equal(typeof result.capabilities.checkedAt, 'number');
    assert.ok(calls.includes('https://api.example.test/v1/models'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
