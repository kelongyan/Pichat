import { isJsonContentType } from './baseUrl.ts';
import type { Protocol, ProviderCapabilities } from '../types';

export interface GenerationAttempt {
  protocol: Protocol;
  stream: boolean;
  reason: 'configured' | 'capability' | 'editing' | 'fallback';
}

interface GenerationPlanInput {
  protocol?: Protocol;
  capabilities?: ProviderCapabilities;
  action: string;
  imageCount: number;
  wantsStream: boolean;
}

function protocolAvailable(protocol: Protocol, capabilities?: ProviderCapabilities): boolean {
  if (!capabilities) return true;
  return protocol === 'responses' ? capabilities.responses : capabilities.images;
}

function supportsStreaming(protocol: Protocol, capabilities: ProviderCapabilities | undefined, wantsStream: boolean): boolean {
  return wantsStream && protocol === 'responses' && capabilities?.streaming !== false;
}

function otherProtocol(protocol: Protocol): Protocol {
  return protocol === 'responses' ? 'images' : 'responses';
}

function dedupeAttempts(attempts: GenerationAttempt[]): GenerationAttempt[] {
  const seen = new Set<Protocol>();
  return attempts.filter((attempt) => {
    if (seen.has(attempt.protocol)) return false;
    seen.add(attempt.protocol);
    return true;
  });
}

export function planGenerationAttempts({
  protocol = 'responses',
  capabilities,
  action,
  imageCount,
  wantsStream,
}: GenerationPlanInput): GenerationAttempt[] {
  const requiresEditing = action === 'edit' && imageCount > 0;

  if (requiresEditing) {
    return [{
      protocol: 'responses',
      stream: supportsStreaming('responses', capabilities, wantsStream),
      reason: 'editing',
    }];
  }

  const fallback = otherProtocol(protocol);
  const attempts: GenerationAttempt[] = [];

  if (protocolAvailable(protocol, capabilities)) {
    attempts.push({
      protocol,
      stream: supportsStreaming(protocol, capabilities, wantsStream),
      reason: 'configured',
    });
  } else if (protocolAvailable(fallback, capabilities)) {
    attempts.push({
      protocol: fallback,
      stream: supportsStreaming(fallback, capabilities, wantsStream),
      reason: 'capability',
    });
  } else {
    attempts.push({
      protocol,
      stream: supportsStreaming(protocol, capabilities, wantsStream),
      reason: 'configured',
    });
  }

  if (protocolAvailable(fallback, capabilities)) {
    attempts.push({
      protocol: fallback,
      stream: supportsStreaming(fallback, capabilities, wantsStream),
      reason: 'fallback',
    });
  }

  return dedupeAttempts(attempts);
}

interface FallbackDecision {
  status: number;
  endpoint: string;
  action: string;
  imageCount: number;
}

export function shouldTryFallbackProtocol({
  status,
  endpoint,
  action,
  imageCount,
}: FallbackDecision): boolean {
  if (status === 401 || status === 403) return false;
  if (action === 'edit' && imageCount > 0 && endpoint === '/responses') return false;
  if (status === 404) return true;
  if (endpoint === '/responses' && status === 400) return true;
  if (endpoint === '/responses' && status >= 500) return true;
  return false;
}

export function shouldParseStreamAsJson(contentType: string | null): boolean {
  return isJsonContentType(contentType);
}
