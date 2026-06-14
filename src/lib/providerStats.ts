import { canUseStorage } from './storage';

const PROVIDER_STATS_STORAGE_KEY = 'pichat_provider_stats';

export interface ProviderStatsEntry {
  providerId: string;
  providerName?: string;
  model?: string;
  total: number;
  success: number;
  failure: number;
  avgDurationMs: number;
  lastDurationMs?: number;
  lastError?: string;
  updatedAt: number;
}

export type ProviderStatsMap = Record<string, ProviderStatsEntry>;

export interface ProviderOutcome {
  providerId: string;
  providerName?: string;
  model?: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  timestamp?: number;
}

export interface ProviderStatsSummary extends ProviderStatsEntry {
  successRate: number;
}

export function normalizeProviderStats(raw: unknown): ProviderStatsMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: ProviderStatsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const providerId = typeof entry.providerId === 'string' && entry.providerId ? entry.providerId : key;
    out[providerId] = {
      providerId,
      providerName: typeof entry.providerName === 'string' ? entry.providerName : undefined,
      model: typeof entry.model === 'string' ? entry.model : undefined,
      total: typeof entry.total === 'number' ? entry.total : 0,
      success: typeof entry.success === 'number' ? entry.success : 0,
      failure: typeof entry.failure === 'number' ? entry.failure : 0,
      avgDurationMs: typeof entry.avgDurationMs === 'number' ? entry.avgDurationMs : 0,
      lastDurationMs: typeof entry.lastDurationMs === 'number' ? entry.lastDurationMs : undefined,
      lastError: typeof entry.lastError === 'string' ? entry.lastError : undefined,
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    };
  }
  return out;
}

export function loadProviderStats(): ProviderStatsMap {
  if (!canUseStorage()) return {};
  try {
    return normalizeProviderStats(JSON.parse(window.localStorage.getItem(PROVIDER_STATS_STORAGE_KEY) || '{}'));
  } catch {
    return {};
  }
}

export function saveProviderStats(stats: ProviderStatsMap): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PROVIDER_STATS_STORAGE_KEY, JSON.stringify(normalizeProviderStats(stats)));
  } catch {
    // quota / private mode — ignore write failure
  }
}

export function recordProviderOutcome(stats: ProviderStatsMap, outcome: ProviderOutcome): ProviderStatsMap {
  const timestamp = outcome.timestamp ?? Date.now();
  const current = stats[outcome.providerId] || {
    providerId: outcome.providerId,
    total: 0,
    success: 0,
    failure: 0,
    avgDurationMs: 0,
    updatedAt: timestamp,
  };
  const total = current.total + 1;
  const success = current.success + (outcome.ok ? 1 : 0);
  const failure = current.failure + (outcome.ok ? 0 : 1);
  const avgDurationMs = Math.round(((current.avgDurationMs || 0) * current.total + outcome.durationMs) / total);

  return {
    ...stats,
    [outcome.providerId]: {
      ...current,
      providerName: outcome.providerName || current.providerName,
      model: outcome.model || current.model,
      total,
      success,
      failure,
      avgDurationMs,
      lastDurationMs: outcome.durationMs,
      lastError: outcome.ok ? undefined : outcome.error,
      updatedAt: timestamp,
    },
  };
}

export function recordGenerationOutcome(outcome: ProviderOutcome): void {
  const stats = recordProviderOutcome(loadProviderStats(), outcome);
  saveProviderStats(stats);
}

export function summarizeProviderStats(stats: ProviderStatsMap): ProviderStatsSummary[] {
  return Object.values(normalizeProviderStats(stats))
    .map((entry) => ({
      ...entry,
      successRate: entry.total > 0 ? entry.success / entry.total : 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
