import { useConfigStore } from './store';
import { getProtocolAdapter } from './protocols/router';
import { getApiBaseURLCandidates, isHtmlContentType, normalizeApiBaseURL } from './baseUrl.ts';
import {
  planGenerationAttempts,
  shouldParseStreamAsJson,
  shouldTryFallbackProtocol,
} from './generationStrategy.ts';
import type {
  Config,
  GenerateImageParams,
  GenerateImageResult,
  Protocol,
  ProtocolAdapter,
  ProviderConfig,
} from '../types';

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1500;

export type ApiErrorType = 'auth' | 'cors' | 'not-found' | 'rate-limit' | 'network' | 'server' | 'unknown';

export class ApiError extends Error {
  errorType: ApiErrorType;
  constructor(message: string, errorType: ApiErrorType) {
    super(message);
    this.name = 'ApiError';
    this.errorType = errorType;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function classifyFetchError(err: unknown, url?: string): Promise<Error> {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return err as Error;
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ApiError('Request timed out — the server may be overloaded. Try again later.', 'server');
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('CORS') || msg.includes('blocked')) {
    return new ApiError(
      'CORS error: The API server does not allow browser requests. This API provider may only support server-side or desktop clients (e.g. Cherry Studio). Try a different API provider, or deploy Pichat behind a reverse proxy.',
      'cors'
    );
  }
  if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('ERR_')) {
    if (url) {
      try {
        await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(5000) });
        return new ApiError(
          'CORS error: The API server is reachable but blocks browser requests (CORS preflight failed). This API provider likely only supports server-side or desktop clients. Try a different provider, or deploy behind a reverse proxy.',
          'cors'
        );
      } catch {
        // server truly unreachable
      }
    }
    return new ApiError(
      'Cannot reach the API server. Check your network connection and verify the API Base URL in Settings.',
      'network'
    );
  }
  return new ApiError(`Network error: ${msg}`, 'network');
}

function classifyHttpError(status: number, detail: string, endpoint?: string): Error {
  switch (status) {
    case 401:
      return new ApiError(
        endpoint === '/responses'
          ? 'Authentication failed — your API key may be invalid, or this provider may not support the Responses protocol. Try switching to Images protocol in Settings.'
          : 'Authentication failed — check your API Key in Settings.',
        'auth',
      );
    case 403:
      return new ApiError('Access denied — your API key may lack the required permissions.', 'auth');
    case 404:
      return new ApiError(
        endpoint === '/responses'
          ? 'Responses API endpoint not available — this provider may only support the Images API.'
          : 'API endpoint not found — verify your API Base URL in Settings.',
        'not-found',
      );
    case 429:
      return new ApiError('Rate limit exceeded — please wait a moment and try again.', 'rate-limit');
    case 500:
    case 502:
    case 503:
    case 504:
      return new ApiError(
        `API server error (${status}) — this is a temporary upstream issue, not a bug. Try again later.`,
        'server'
      );
    default:
      return new ApiError(`API error ${status}: ${detail}`, 'unknown');
  }
}

let cachedSystemPromptTemplate: string | null = null;
let cachedSystemPromptVersion: string | null = null;

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function parseFrontMatter(raw: string): { body: string; version: string | null } {
  const match = raw.match(FRONT_MATTER_RE);
  if (!match) return { body: raw, version: null };
  const body = raw.slice(match[0].length);
  const front = match[1];
  const versionLine = front
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^version:/.test(l));
  const version = versionLine ? versionLine.split(':', 2)[1].trim() : null;
  return { body, version };
}

function injectPromptVariables(template: string): string {
  const vars: Record<string, string> = {
    CURRENT_DATE: new Date().toISOString().split('T')[0],
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

const MINIMAL_PROMPT = `You are Pichat, an AI assistant with conversational and image generation capabilities.

The current date is {{CURRENT_DATE}}.

# Platform

 - Model ID: \`gpt-image-2\`
 - Platform: Pichat
 - Developed by: MoYeRanQianZhi
 - Knowledge cutoff: 2026-06
 - Context window: 1M`;

export async function preloadSystemPrompt(): Promise<void> {
  if (cachedSystemPromptTemplate !== null) return;
  try {
    const resp = await fetch('assets/system-prompt.md');
    if (!resp.ok) {
      cachedSystemPromptTemplate = '';
      cachedSystemPromptVersion = null;
      return;
    }
    const raw = await resp.text();
    const { body, version } = parseFrontMatter(raw);
    cachedSystemPromptTemplate = body;
    cachedSystemPromptVersion = version;
  } catch {
    cachedSystemPromptTemplate = '';
    cachedSystemPromptVersion = null;
  }
}

/** Returns the parsed version field from system-prompt.md front-matter, or null. */
export function getSystemPromptVersion(): string | null {
  return cachedSystemPromptVersion;
}

async function getSystemPrompt(full: boolean): Promise<string> {
  if (!full) return injectPromptVariables(MINIMAL_PROMPT);
  if (cachedSystemPromptTemplate === null) {
    await preloadSystemPrompt();
  }
  return injectPromptVariables(cachedSystemPromptTemplate!);
}

function getConfig(): Config | null {
  return useConfigStore.getState().config;
}

function resolveProvider(config: Config, providerId?: string): ProviderConfig {
  const requestedId = providerId || config.defaultProviderId;
  const provider = config.providers.find((item) => item.id === requestedId)
    || config.providers.find((item) => item.id === config.defaultProviderId)
    || config.providers[0];
  if (!provider) {
    throw new Error('No API provider configured. Add a provider in Settings.');
  }
  return provider;
}

function persistProviderPatch(providerId: string, patch: Partial<ProviderConfig>) {
  const config = getConfig();
  if (!config) return;
  const updated: Config = {
    ...config,
    providers: config.providers.map((p) =>
      p.id === providerId ? { ...p, ...patch, updatedAt: Date.now() } : p,
    ),
  };
  useConfigStore.getState().save(updated);
}

function persistSuccessfulProviderState(provider: ProviderConfig, protocol: Protocol, baseURL: string) {
  const patch: Partial<ProviderConfig> = {};
  if ((provider.protocol || 'responses') !== protocol) {
    patch.protocol = protocol;
  }
  if (normalizeApiBaseURL(provider.baseURL) !== normalizeApiBaseURL(baseURL)) {
    patch.baseURL = baseURL;
  }
  if (Object.keys(patch).length > 0) {
    persistProviderPatch(provider.id, patch);
  }
}

function parseErrorDetail(text: string): string {
  try {
    const data = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return data.error?.message || data.message || text;
  } catch {
    return text;
  }
}

interface ProtocolFailure {
  protocol: Protocol;
  endpoint: string;
  status: number;
  detail: string;
}

function buildProtocolFailureError(provider: ProviderConfig, failures: ProtocolFailure[]): Error {
  const last = failures[failures.length - 1];
  if (!last) {
    return new ApiError('Generation failed before the API returned a response.', 'unknown');
  }

  if (failures.length === 1) {
    return classifyHttpError(last.status, last.detail, last.endpoint);
  }

  const lines = failures.map((failure) =>
    `${failure.endpoint} (${failure.protocol}) -> HTTP ${failure.status}: ${failure.detail}`,
  );

  return new ApiError(
    `Both API protocols failed for "${provider.name}".\n`
    + `${lines.join('\n')}\n`
    + 'Check that your API Base URL and Key are correct, and that your provider supports image generation.',
    'unknown',
  );
}

interface AdapterRequestResult {
  response: Response;
  url: string;
  baseURL: string;
}

async function postAdapterRequest(
  provider: ProviderConfig,
  adapter: ProtocolAdapter,
  payload: unknown,
  signal: AbortSignal,
): Promise<AdapterRequestResult> {
  const candidates = getApiBaseURLCandidates(provider.baseURL);
  const suggested = candidates.find((baseURL) => baseURL !== normalizeApiBaseURL(provider.baseURL));
  let lastUrl = '';

  for (const baseURL of candidates) {
    const url = `${baseURL}${adapter.getEndpoint()}`;
    lastUrl = url;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (isHtmlContentType(response.headers.get('content-type'))) {
      continue;
    }

    return { response, url, baseURL };
  }

  throw new ApiError(
    suggested
      ? `API Base URL returned a web page instead of an API response. Pichat will try "${suggested}" automatically; if this keeps happening, set the provider Base URL to "${suggested}" in Settings.`
      : `API Base URL returned a web page instead of an API response: ${lastUrl}`,
    'not-found',
  );
}

async function readAdapterResult(
  adapter: ProtocolAdapter,
  response: Response,
  onStream?: (delta: { text: string | null; imageBase64: string | null; done?: boolean }) => void,
): Promise<GenerateImageResult> {
  const useStreamReader = !!onStream
    && adapter.supportsStreaming
    && adapter.readStream
    && !shouldParseStreamAsJson(response.headers.get('content-type'));

  const result = useStreamReader
    ? await adapter.readStream!(response, onStream)
    : await adapter.parseResponse(response);

  if (onStream && !useStreamReader) {
    onStream({ text: result.text, imageBase64: result.imageBase64, done: true });
  }

  return result;
}

export async function generateImage({
  prompt,
  size = '1024x1024',
  action = 'auto',
  images = [],
  providerId,
  onStream,
  history = [],
  signal,
}: GenerateImageParams): Promise<GenerateImageResult> {
  const config = getConfig();
  if (!config) throw new Error('Not configured');
  const provider = resolveProvider(config, providerId);

  const instructions = await getSystemPrompt(config.useSystemPrompt !== false);
  const plannedAttempts = planGenerationAttempts({
    protocol: provider.protocol || 'responses',
    capabilities: provider.capabilities,
    action,
    imageCount: images.length,
    wantsStream: !!onStream,
  });
  const failures: ProtocolFailure[] = [];

  attempts: for (let attemptIndex = 0; attemptIndex < plannedAttempts.length; attemptIndex++) {
    const planned = plannedAttempts[attemptIndex];
    const attemptProvider: ProviderConfig = { ...provider, protocol: planned.protocol };
    const adapter = getProtocolAdapter(attemptProvider);

    if (action === 'edit' && images.length > 0 && !adapter.supportsEditing) {
      failures.push({
        protocol: planned.protocol,
        endpoint: adapter.getEndpoint(),
        status: 0,
        detail: 'This protocol does not support reference image editing.',
      });
      continue;
    }

    const payload = adapter.buildPayload({
      provider: attemptProvider,
      prompt,
      size,
      action,
      images,
      history,
      instructions,
      stream: planned.stream && adapter.supportsStreaming,
    });

    const maxAttempts = planned.stream ? 1 : MAX_RETRIES + 1;
    let requestUrl = '';

    for (let retryIndex = 0; retryIndex < maxAttempts; retryIndex++) {
      if (retryIndex > 0) {
        const delay = RETRY_BASE_MS * Math.pow(2, retryIndex - 1);
        await sleep(delay);
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      }

      let request: AdapterRequestResult;
      try {
        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const combinedSignal = signal
          ? AbortSignal.any([signal, timeoutSignal])
          : timeoutSignal;

        request = await postAdapterRequest(attemptProvider, adapter, payload, combinedSignal);
        requestUrl = request.url;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        if (err instanceof ApiError) {
          throw err;
        }
        if (retryIndex < maxAttempts - 1) {
          continue;
        }
        throw await classifyFetchError(err, requestUrl);
      }

      const { response, baseURL } = request;

      if (!response.ok) {
        if (isRetryableStatus(response.status) && retryIndex < maxAttempts - 1) {
          continue;
        }

        const endpoint = adapter.getEndpoint();
        const detail = parseErrorDetail(await response.text());
        failures.push({ protocol: planned.protocol, endpoint, status: response.status, detail });

        if (
          attemptIndex < plannedAttempts.length - 1
          && shouldTryFallbackProtocol({
            status: response.status,
            endpoint,
            action,
            imageCount: images.length,
          })
        ) {
          continue attempts;
        }

        throw buildProtocolFailureError(provider, failures);
      }

      const result = await readAdapterResult(
        adapter,
        response,
        onStream,
      );
      persistSuccessfulProviderState(provider, planned.protocol, baseURL);
      return result;
    }
  }

  throw buildProtocolFailureError(provider, failures);
}
