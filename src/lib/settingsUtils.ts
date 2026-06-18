import type { Protocol, ProviderConfig } from '../types';

export interface ModelInfo {
  id: string;
  owned_by?: string;
}

const IMAGE_MODEL_PATTERNS = [
  'gpt-image',
  'dall-e',
  'image',
  'img',
  'pic',
  'draw',
  'paint',
  'generate',
];

export function isImageModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return IMAGE_MODEL_PATTERNS.some((p) => lower.includes(p));
}

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

export interface TestConnectionResult {
  protocol: Protocol;
}

export async function testProviderConnection(provider: ProviderConfig): Promise<TestConnectionResult> {
  const base = provider.baseURL.trim().replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${provider.apiKey.trim()}` };

  // Probe 1: Images API — POST /images/generations (prefer this for image apps)
  try {
    const resp = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: provider.model || 'gpt-image-2', prompt: 'test', n: 1, response_format: 'b64_json' }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      return { protocol: 'images' };
    }
    // 401/403 = auth error but endpoint exists
    if (resp.status === 401 || resp.status === 403) {
      return { protocol: 'images' };
    }
  } catch {
    // Network error — continue to probe 2
  }

  // Probe 2: Responses API — GET /models
  try {
    const resp = await fetch(`${base}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });
    // 200 = models endpoint exists, 404 = responses API exists but /models not implemented
    if (resp.ok || resp.status === 404) {
      return { protocol: 'responses' };
    }
  } catch {
    // Network error or timeout — continue to throw
  }

  throw new Error('Could not detect API protocol — neither Images nor Responses endpoint responded');
}

export async function fetchModels(provider: ProviderConfig, imageOnly = true): Promise<ModelInfo[]> {
  const base = provider.baseURL.trim().replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${provider.apiKey.trim()}` };

  const resp = await fetch(`${base}/models`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Authentication failed — check your API Key');
    }
    if (resp.status === 404) {
      throw new Error('Models endpoint not supported by this provider');
    }
    throw new Error(`HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const list = Array.isArray(data) ? data : data?.data;
  if (!Array.isArray(list)) {
    throw new Error('Unexpected response format');
  }

  const models = list
    .map((m: { id?: string; owned_by?: string }) => ({ id: m.id || '', owned_by: m.owned_by }))
    .filter((m: ModelInfo) => m.id.length > 0);

  if (imageOnly) {
    return models.filter((m: ModelInfo) => isImageModel(m.id));
  }

  return models;
}
