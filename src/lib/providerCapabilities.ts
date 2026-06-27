import type { ProviderCapabilities } from '../types';

interface CapabilityInput {
  responses: boolean;
  images: boolean;
  authOk: boolean;
  reachable: boolean;
  checkedAt?: number;
}

export function buildProviderCapabilities({
  responses,
  images,
  authOk,
  reachable,
  checkedAt = Date.now(),
}: CapabilityInput): ProviderCapabilities {
  return {
    responses,
    images,
    streaming: responses,
    editing: responses,
    authOk,
    reachable,
    checkedAt,
  };
}

export function normalizeProviderCapabilities(raw: unknown): ProviderCapabilities | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<ProviderCapabilities>;
  if (
    typeof value.responses !== 'boolean'
    || typeof value.images !== 'boolean'
    || typeof value.streaming !== 'boolean'
    || typeof value.editing !== 'boolean'
    || typeof value.authOk !== 'boolean'
    || typeof value.reachable !== 'boolean'
  ) {
    return undefined;
  }

  return {
    responses: value.responses,
    images: value.images,
    streaming: value.streaming,
    editing: value.editing,
    authOk: value.authOk,
    reachable: value.reachable,
    checkedAt: typeof value.checkedAt === 'number' ? value.checkedAt : Date.now(),
  };
}
