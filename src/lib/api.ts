import { useConfigStore } from './store';
import { getProtocolAdapter } from './protocols/router';
import type {
  Config,
  GenerateImageParams,
  GenerateImageResult,
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

function classifyHttpError(status: number, detail: string): Error {
  switch (status) {
    case 401:
      return new ApiError('Authentication failed — check your API Key in Settings.', 'auth');
    case 403:
      return new ApiError('Access denied — your API key may lack the required permissions.', 'auth');
    case 404:
      return new ApiError('API endpoint not found — verify your API Base URL in Settings.', 'not-found');
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
  const adapter = getProtocolAdapter(provider);

  if (action === 'edit' && images.length > 0 && !adapter.supportsEditing) {
    throw new Error(
      'Image editing is not supported by the Images API protocol. Switch to a Responses API provider for editing.'
    );
  }

  const instructions = await getSystemPrompt(config.useSystemPrompt !== false);
  const payload = adapter.buildPayload({
    provider,
    prompt,
    size,
    action,
    images,
    history,
    instructions,
    stream: !!onStream,
  });

  const url = `${provider.baseURL.replace(/\/+$/, '')}${adapter.getEndpoint()}`;
  let response: Response;
  let lastError: Error | null = null;
  const maxAttempts = (onStream && adapter.supportsStreaming) ? 1 : MAX_RETRIES + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (attempt < maxAttempts - 1) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      throw await classifyFetchError(err, url);
    }

    if (!response!.ok) {
      if (isRetryableStatus(response!.status) && attempt < maxAttempts - 1) {
        lastError = classifyHttpError(response!.status, '');
        continue;
      }
      const text = await response!.text();
      let detail = text;
      try {
        detail = JSON.parse(text).error?.message || text;
      } catch {
        // keep raw text
      }
      throw classifyHttpError(response!.status, detail);
    }

    lastError = null;
    break;
  }

  if (lastError) throw lastError;

  // 流式处理
  if (onStream) {
    if (adapter.supportsStreaming && adapter.readStream) {
      return adapter.readStream(response!, onStream);
    }
    // 降级：非流式请求，结果返回后一次性回调
    const result = await adapter.parseResponse(response!);
    onStream({ text: result.text, imageBase64: result.imageBase64, done: true });
    return result;
  }

  return adapter.parseResponse(response!);
}
