import type { Protocol, ProviderCapabilities, ProviderConfig } from '../types';
import { getApiBaseURLCandidates, isJsonContentType } from './baseUrl.ts';
import { buildProviderCapabilities } from './providerCapabilities.ts';

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
  authOk: boolean;
  reachable: boolean;
  baseURL: string;
  capabilities: ProviderCapabilities;
}

interface ProbeResponse {
  status: number;
  apiLike: boolean;
}

interface BaseProbeResult {
  baseURL: string;
  modelsOk: boolean;
  modelsAuthFailed: boolean;
  responses: ProbeResponse;
  images: ProbeResponse;
  reachable: boolean;
}

async function probeResponse(url: string, init: RequestInit): Promise<ProbeResponse> {
  try {
    const resp = await fetch(url, init);
    return {
      status: resp.status,
      apiLike: isJsonContentType(resp.headers.get('content-type')),
    };
  } catch {
    return { status: -1, apiLike: false };
  }
}

function endpointExists(probe: ProbeResponse): boolean {
  if (!probe.apiLike) return false;
  return probe.status === 400
    || probe.status === 422
    || (probe.status >= 200 && probe.status < 300)
    || probe.status === 429
    || probe.status >= 500;
}

function validationRejected(probe: ProbeResponse): boolean {
  return probe.apiLike && (probe.status === 400 || probe.status === 422);
}

async function probeBaseURL(base: string, provider: ProviderConfig): Promise<BaseProbeResult> {
  const headers = { Authorization: `Bearer ${provider.apiKey.trim()}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  // Probe /models — free reachability + auth check
  let modelsOk = false;
  let modelsAuthFailed = false;
  try {
    const resp = await fetch(`${base}/models`, { method: 'GET', headers, signal: AbortSignal.timeout(10000) });
    const apiLike = isJsonContentType(resp.headers.get('content-type'));
    modelsOk = resp.ok && apiLike;
    modelsAuthFailed = apiLike && (resp.status === 401 || resp.status === 403);
  } catch {
    // unreachable
  }

  // Probe /responses — empty body triggers validation error if endpoint exists
  const responses = await probeResponse(`${base}/responses`, {
    method: 'POST', headers: jsonHeaders, body: '{}', signal: AbortSignal.timeout(10000),
  });

  // Probe /images/generations — minimal payload to distinguish "endpoint exists" from "route unknown"
  // A real endpoint returns 400/422 (missing fields); an unknown route returns 401/404
  const images = await probeResponse(`${base}/images/generations`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ model: provider.model || 'gpt-image-2', prompt: '' }),
    signal: AbortSignal.timeout(10000),
  });

  const reachable = modelsOk || modelsAuthFailed || responses.apiLike || images.apiLike;
  return { baseURL: base, modelsOk, modelsAuthFailed, responses, images, reachable };
}

export async function testProviderConnection(provider: ProviderConfig): Promise<TestConnectionResult> {
  const probes: BaseProbeResult[] = [];
  for (const base of getApiBaseURLCandidates(provider.baseURL)) {
    const probe = await probeBaseURL(base, provider);
    if (probe.reachable) probes.push(probe);
  }

  const selected = probes.find((probe) => probe.modelsOk && (endpointExists(probe.responses) || endpointExists(probe.images)))
    || probes.find((probe) => endpointExists(probe.responses) || endpointExists(probe.images))
    || probes.find((probe) => probe.modelsOk || probe.modelsAuthFailed)
    || probes[0];

  if (!selected) {
    throw new Error('Could not detect API protocol — API server is unreachable');
  }

  const responsesExists = endpointExists(selected.responses);
  const imagesExists = endpointExists(selected.images);

  let protocol: Protocol;
  let authOk: boolean;

  if (imagesExists && !responsesExists) {
    protocol = 'images';
    authOk = selected.modelsOk || validationRejected(selected.images);
  } else if (responsesExists && !imagesExists) {
    protocol = 'responses';
    authOk = selected.modelsOk || validationRejected(selected.responses);
  } else if (responsesExists && imagesExists) {
    // Both exist — prefer responses (streaming/history/editing).
    // authOk must be confirmed by /models 200 (the only reliable auth probe);
    // a 400 on an endpoint only proves the route exists, not that the key works.
    authOk = selected.modelsOk;
    protocol = 'responses';
  } else {
    // Neither endpoint confirmed — default to responses
    protocol = 'responses';
    authOk = selected.modelsOk;
  }

  return {
    protocol,
    authOk,
    reachable: selected.reachable,
    baseURL: selected.baseURL,
    capabilities: buildProviderCapabilities({
      responses: responsesExists,
      images: imagesExists,
      authOk,
      reachable: selected.reachable,
    }),
  };
}

export async function fetchModels(provider: ProviderConfig, imageOnly = true): Promise<ModelInfo[]> {
  const headers = { Authorization: `Bearer ${provider.apiKey.trim()}` };

  let lastStatus = 0;
  for (const base of getApiBaseURLCandidates(provider.baseURL)) {
    const resp = await fetch(`${base}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    });
    lastStatus = resp.status;

    if (!isJsonContentType(resp.headers.get('content-type'))) {
      continue;
    }

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

  throw new Error(lastStatus ? `Models endpoint did not return JSON (HTTP ${lastStatus})` : 'Models endpoint not reachable');
}
