import type { ProviderConfig } from '../types';

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    name: provider.name.trim() || 'Untitled Provider',
    baseURL: provider.baseURL.trim(),
    apiKey: provider.apiKey.trim(),
    model: provider.model.trim() || 'gpt-image-2',
    updatedAt: Date.now(),
  };
}

export function validateProvider(provider: ProviderConfig): string | null {
  if (!provider.name.trim()) return 'Provider name is required';
  if (!provider.baseURL.trim() || !provider.apiKey.trim()) return 'Please fill in all provider fields';
  if (!isValidHttpUrl(provider.baseURL.trim())) return 'Please enter a valid HTTP(S) API Base URL';
  return null;
}

export async function testProviderConnection(provider: ProviderConfig): Promise<void> {
  const base = provider.baseURL.trim().replace(/\/+$/, '');
  const protocol = provider.protocol || 'responses';
  const endpoint = protocol === 'images' ? '/images/generations' : '/models';
  const resp = await fetch(`${base}${endpoint}`, {
    method: protocol === 'images' ? 'POST' : 'HEAD',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      ...(protocol === 'images' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: protocol === 'images'
      ? JSON.stringify({ model: provider.model, prompt: 'test', n: 1, response_format: 'b64_json' })
      : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok && !(protocol === 'responses' && resp.status === 404)) {
    throw new Error(`HTTP ${resp.status}`);
  }
}
