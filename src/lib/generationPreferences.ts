import type { ImageAspect, ImageResolution } from './imagePresets.ts';
import {
  DEFAULT_PROMPT_STUDIO_STATE,
  getUseCaseDefaults,
  normalizePromptStudioState,
  type PromptStudioState,
  type StudioUseCase,
} from './promptStudio.ts';

export const GENERATION_PREFERENCES_STORAGE_KEY = 'pichat_generation_preferences';

export interface GenerationPreferences {
  aspect: ImageAspect;
  resolution: ImageResolution;
  customW: string;
  customH: string;
  studio: PromptStudioState;
}

export const DEFAULT_GENERATION_PREFERENCES: GenerationPreferences = {
  aspect: 'auto',
  resolution: 'standard',
  customW: '',
  customH: '',
  studio: { ...DEFAULT_PROMPT_STUDIO_STATE },
};

const VALID_ASPECTS: ImageAspect[] = ['auto', '1:1', '16:9', '4:3', 'wide', 'vertical', 'custom'];
const VALID_RESOLUTIONS: ImageResolution[] = ['standard', 'hd', '2k', '4k'];

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function pickAspect(value: unknown): ImageAspect {
  return typeof value === 'string' && VALID_ASPECTS.includes(value as ImageAspect)
    ? value as ImageAspect
    : DEFAULT_GENERATION_PREFERENCES.aspect;
}

function pickResolution(value: unknown): ImageResolution {
  return typeof value === 'string' && VALID_RESOLUTIONS.includes(value as ImageResolution)
    ? value as ImageResolution
    : DEFAULT_GENERATION_PREFERENCES.resolution;
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveStudioUseCaseAspectDefault(
  currentAspect: ImageAspect,
  useCase: StudioUseCase,
): ImageAspect {
  if (currentAspect !== 'auto') return currentAspect;
  return getUseCaseDefaults(useCase).aspect || currentAspect;
}

export function normalizeGenerationPreferences(raw: Partial<GenerationPreferences> | null | undefined): GenerationPreferences {
  return {
    aspect: pickAspect(raw?.aspect),
    resolution: pickResolution(raw?.resolution),
    customW: pickText(raw?.customW),
    customH: pickText(raw?.customH),
    studio: normalizePromptStudioState(raw?.studio),
  };
}

export function loadGenerationPreferences(): GenerationPreferences {
  if (!canUseStorage()) return DEFAULT_GENERATION_PREFERENCES;
  try {
    return normalizeGenerationPreferences(
      JSON.parse(window.localStorage.getItem(GENERATION_PREFERENCES_STORAGE_KEY) || 'null'),
    );
  } catch {
    return DEFAULT_GENERATION_PREFERENCES;
  }
}

export function saveGenerationPreferences(preferences: GenerationPreferences): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    GENERATION_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeGenerationPreferences(preferences)),
  );
}
