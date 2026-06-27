import { create } from 'zustand';
import type { Config, ProviderConfig } from '../types';
import { generateId } from './utils';
import { normalizeProviderCapabilities } from './providerCapabilities.ts';

const CONFIG_KEY = 'gpt2image_config';

function createProviderFromLegacy(parsed: Record<string, unknown>): ProviderConfig | null {
  const baseURL = typeof parsed.baseURL === 'string' ? parsed.baseURL.trim() : '';
  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  if (!baseURL || !apiKey) return null;
  const now = Date.now();
  return {
    id: typeof parsed.defaultProviderId === 'string' && parsed.defaultProviderId
      ? parsed.defaultProviderId
      : generateId(),
    name: 'Default',
    baseURL,
    apiKey,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : 'gpt-image-2',
    protocol: 'responses' as const,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeProvider(raw: unknown, index: number): ProviderConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const provider = raw as Record<string, unknown>;
  const baseURL = typeof provider.baseURL === 'string' ? provider.baseURL.trim() : '';
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
  if (!baseURL || !apiKey) return null;
  const now = Date.now();
  return {
    id: typeof provider.id === 'string' && provider.id ? provider.id : generateId(),
    name: typeof provider.name === 'string' && provider.name.trim()
      ? provider.name.trim()
      : `Provider ${index + 1}`,
    baseURL,
    apiKey,
    model: typeof provider.model === 'string' && provider.model.trim()
      ? provider.model.trim()
      : 'gpt-image-2',
    protocol: (provider.protocol === 'responses' || provider.protocol === 'images')
      ? provider.protocol
      : 'responses' as const,
    capabilities: normalizeProviderCapabilities(provider.capabilities),
    createdAt: typeof provider.createdAt === 'number' ? provider.createdAt : now,
    updatedAt: typeof provider.updatedAt === 'number' ? provider.updatedAt : now,
  };
}

function normalizeConfig(parsed: Record<string, unknown>): Config | null {
  const providers = Array.isArray(parsed.providers)
    ? parsed.providers
      .map((provider, index) => normalizeProvider(provider, index))
      .filter((provider): provider is ProviderConfig => !!provider)
    : [];

  if (providers.length === 0) {
    const legacyProvider = createProviderFromLegacy(parsed);
    if (legacyProvider) providers.push(legacyProvider);
  }

  if (providers.length === 0) return null;

  const requestedDefault = typeof parsed.defaultProviderId === 'string'
    ? parsed.defaultProviderId
    : '';
  const defaultProviderId = providers.some((provider) => provider.id === requestedDefault)
    ? requestedDefault
    : providers[0].id;

  return {
    providers,
    defaultProviderId,
    darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : false,
    useSystemPrompt: typeof parsed.useSystemPrompt === 'boolean' ? parsed.useSystemPrompt : true,
  };
}

interface ConfigState {
  config: Config | null;
  loaded: boolean;
  load: () => void;
  save: (config: Config) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loaded: false,
  load: () => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const config = normalizeConfig(parsed);
        if (!config) {
          localStorage.removeItem(CONFIG_KEY);
          set({ config: null, loaded: true });
          return;
        }
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        } catch {
          // quota / private mode — config still usable in memory
        }
        set({ config, loaded: true });
      } else {
        set({ config: null, loaded: true });
      }
    } catch {
      // corrupt JSON in localStorage — drop it and continue
      try { localStorage.removeItem(CONFIG_KEY); } catch { /* ignore */ }
      set({ config: null, loaded: true });
    }
  },
  save: (config: Config) => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      // quota / private mode — ignore write failure
    }
    set({ config });
  },
}));
