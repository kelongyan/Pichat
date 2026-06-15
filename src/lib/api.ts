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
    return new Error('Request timed out — the server may be overloaded. Try again later.');
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('CORS') || msg.includes('blocked')) {
    return new Error(
      'CORS error: The API server does not allow browser requests. This API provider may only support server-side or desktop clients (e.g. Cherry Studio). Try a different API provider, or deploy Pichat behind a reverse proxy.'
    );
  }
  if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('ERR_')) {
    if (url) {
      try {
        await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(5000) });
        return new Error(
          'CORS error: The API server is reachable but blocks browser requests (CORS preflight failed). This API provider likely only supports server-side or desktop clients. Try a different provider, or deploy behind a reverse proxy.'
        );
      } catch {
        // server truly unreachable
      }
    }
    return new Error(
      'Cannot reach the API server. Check your network connection and verify the API Base URL in Settings.'
    );
  }
  return new Error(`Network error: ${msg}`);
}

function classifyHttpError(status: number, detail: string): Error {
  switch (status) {
    case 401:
      return new Error('Authentication failed — check your API Key in Settings.');
    case 403:
      return new Error('Access denied — your API key may lack the required permissions.');
    case 404:
      return new Error('API endpoint not found — verify your API Base URL in Settings.');
    case 429:
      return new Error('Rate limit exceeded — please wait a moment and try again.');
    case 500:
    case 502:
    case 503:
    case 504:
      return new Error(
        `API server error (${status}) — this is a temporary upstream issue, not a bug. Try again later.`
      );
    default:
      return new Error(`API error ${status}: ${detail}`);
  }
}

let cachedSystemPromptTemplate: string | null = null;

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
    cachedSystemPromptTemplate = resp.ok ? await resp.text() : '';
  } catch {
    cachedSystemPromptTemplate = '';
  }
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
