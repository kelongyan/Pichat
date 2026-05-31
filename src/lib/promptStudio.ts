import type { ImageAspect } from './imagePresets';

export type StudioUseCase =
  | 'none'
  | 'avatar'
  | 'poster'
  | 'product'
  | 'wallpaper'
  | 'sticker'
  | 'character'
  | 'cover';

export type StudioStyle =
  | 'none'
  | 'photoreal'
  | 'cinematic'
  | 'illustration'
  | 'anime'
  | 'watercolor'
  | 'minimal';

export type StudioShot = 'none' | 'close' | 'wide' | 'top' | 'low';
export type StudioComposition = 'none' | 'centered' | 'wide' | 'rule-thirds' | 'negative-space';
export type StudioTone = 'none' | 'clean' | 'warm' | 'dramatic' | 'dreamy' | 'vibrant';
export type StudioMaterial = 'none' | 'paper' | 'clay' | 'glass' | 'fabric';

export interface PromptStudioState {
  useCase: StudioUseCase;
  style: StudioStyle;
  shot: StudioShot;
  composition: StudioComposition;
  tone: StudioTone;
  material: StudioMaterial;
}

export interface StudioOption<T extends string> {
  value: T;
  label: string;
  title: string;
}

export const PROMPT_STUDIO_STORAGE_KEY = 'pichat_prompt_studio';

export const DEFAULT_PROMPT_STUDIO_STATE: PromptStudioState = {
  useCase: 'none',
  style: 'none',
  shot: 'none',
  composition: 'none',
  tone: 'none',
  material: 'none',
};

export const USE_CASE_OPTIONS: StudioOption<StudioUseCase>[] = [
  { value: 'none', label: 'None', title: 'No use-case direction' },
  { value: 'avatar', label: 'Avatar', title: 'Profile picture with clear subject' },
  { value: 'poster', label: 'Poster', title: 'Poster-ready layout and hierarchy' },
  { value: 'product', label: 'Product', title: 'Commercial product image' },
  { value: 'wallpaper', label: 'Wallpaper', title: 'Wide wallpaper composition' },
  { value: 'sticker', label: 'Sticker', title: 'Clean sticker-like subject' },
  { value: 'character', label: 'Character', title: 'Character design sheet feeling' },
  { value: 'cover', label: 'Cover', title: 'Vertical cover image' },
];

export const STYLE_OPTIONS: StudioOption<StudioStyle>[] = [
  { value: 'none', label: 'Auto', title: 'Let the model choose the style' },
  { value: 'photoreal', label: 'Photo', title: 'Photorealistic image' },
  { value: 'cinematic', label: 'Film', title: 'Cinematic lighting and color' },
  { value: 'illustration', label: 'Illustration', title: 'Editorial illustration' },
  { value: 'anime', label: 'Anime', title: 'Anime-inspired rendering' },
  { value: 'watercolor', label: 'Watercolor', title: 'Watercolor texture' },
  { value: 'minimal', label: 'Minimal', title: 'Minimal clean visual language' },
];

export const SHOT_OPTIONS: StudioOption<StudioShot>[] = [
  { value: 'none', label: 'Auto', title: 'Let the model choose the shot' },
  { value: 'close', label: 'Close', title: 'Close-up framing' },
  { value: 'wide', label: 'Wide', title: 'Wide establishing shot' },
  { value: 'top', label: 'Top', title: 'Top-down angle' },
  { value: 'low', label: 'Low', title: 'Low-angle view' },
];

export const COMPOSITION_OPTIONS: StudioOption<StudioComposition>[] = [
  { value: 'none', label: 'Auto', title: 'Let the model choose composition' },
  { value: 'centered', label: 'Center', title: 'Centered subject' },
  { value: 'wide', label: 'Scene', title: 'Wide scene composition' },
  { value: 'rule-thirds', label: 'Thirds', title: 'Rule-of-thirds placement' },
  { value: 'negative-space', label: 'Space', title: 'Negative space for layout' },
];

export const TONE_OPTIONS: StudioOption<StudioTone>[] = [
  { value: 'none', label: 'Auto', title: 'Let the model choose tone' },
  { value: 'clean', label: 'Clean', title: 'Clean neutral palette' },
  { value: 'warm', label: 'Warm', title: 'Warm inviting palette' },
  { value: 'dramatic', label: 'Drama', title: 'Dramatic contrast' },
  { value: 'dreamy', label: 'Dreamy', title: 'Soft dreamy atmosphere' },
  { value: 'vibrant', label: 'Vibrant', title: 'Vibrant color palette' },
];

export const MATERIAL_OPTIONS: StudioOption<StudioMaterial>[] = [
  { value: 'none', label: 'Auto', title: 'No material direction' },
  { value: 'paper', label: 'Paper', title: 'Paper texture and print tactility' },
  { value: 'clay', label: 'Clay', title: 'Clay or ceramic finish' },
  { value: 'glass', label: 'Glass', title: 'Glass and reflective materials' },
  { value: 'fabric', label: 'Fabric', title: 'Fabric texture and softness' },
];

const USE_CASE_DIRECTIONS: Record<Exclude<StudioUseCase, 'none'>, string> = {
  avatar: 'profile avatar with a clear centered subject and generous crop-safe margins',
  poster: 'poster design with strong visual hierarchy and room for optional text if requested',
  product: 'product image with clean presentation, readable silhouette, and commercial polish',
  wallpaper: 'wallpaper composition with immersive scenery and no distracting text',
  sticker: 'sticker-style subject with a clean outline, simple background, and readable shape',
  character: 'character design with clear silhouette, expressive pose, and consistent details',
  cover: 'cover image with vertical composition, strong focal point, and readable negative space',
};

const STYLE_DIRECTIONS: Record<Exclude<StudioStyle, 'none'>, string> = {
  photoreal: 'photorealistic rendering with natural lighting',
  cinematic: 'cinematic lighting',
  illustration: 'editorial illustration style',
  anime: 'anime-inspired illustration',
  watercolor: 'watercolor texture and soft pigment edges',
  minimal: 'minimal visual language with restrained detail',
};

const SHOT_DIRECTIONS: Record<Exclude<StudioShot, 'none'>, string> = {
  close: 'close-up framing',
  wide: 'wide establishing shot',
  top: 'top-down angle',
  low: 'low-angle view',
};

const COMPOSITION_DIRECTIONS: Record<Exclude<StudioComposition, 'none'>, string> = {
  centered: 'centered subject',
  wide: 'wide scene composition',
  'rule-thirds': 'rule-of-thirds placement',
  'negative-space': 'negative space for clean layout',
};

const TONE_DIRECTIONS: Record<Exclude<StudioTone, 'none'>, string> = {
  clean: 'clean neutral palette',
  warm: 'warm inviting palette',
  dramatic: 'dramatic contrast and mood',
  dreamy: 'soft dreamy atmosphere',
  vibrant: 'vibrant color palette',
};

const MATERIAL_DIRECTIONS: Record<Exclude<StudioMaterial, 'none'>, string> = {
  paper: 'tactile paper texture',
  clay: 'tactile clay/ceramic finish',
  glass: 'transparent glass and reflective surfaces',
  fabric: 'visible fabric texture and softness',
};

const VALID_VALUES = {
  useCase: USE_CASE_OPTIONS.map((option) => option.value),
  style: STYLE_OPTIONS.map((option) => option.value),
  shot: SHOT_OPTIONS.map((option) => option.value),
  composition: COMPOSITION_OPTIONS.map((option) => option.value),
  tone: TONE_OPTIONS.map((option) => option.value),
  material: MATERIAL_OPTIONS.map((option) => option.value),
};

function pickValue<T extends keyof PromptStudioState>(
  key: T,
  value: unknown,
): PromptStudioState[T] {
  const values = VALID_VALUES[key] as string[];
  return typeof value === 'string' && values.includes(value)
    ? value as PromptStudioState[T]
    : DEFAULT_PROMPT_STUDIO_STATE[key];
}

export function normalizePromptStudioState(raw: Partial<Record<keyof PromptStudioState, unknown>> | null | undefined): PromptStudioState {
  return {
    useCase: pickValue('useCase', raw?.useCase),
    style: pickValue('style', raw?.style),
    shot: pickValue('shot', raw?.shot),
    composition: pickValue('composition', raw?.composition),
    tone: pickValue('tone', raw?.tone),
    material: pickValue('material', raw?.material),
  };
}

export function parsePromptStudioState(raw: string | null): PromptStudioState {
  if (!raw) return DEFAULT_PROMPT_STUDIO_STATE;
  try {
    return normalizePromptStudioState(JSON.parse(raw));
  } catch {
    return DEFAULT_PROMPT_STUDIO_STATE;
  }
}

export function serializePromptStudioState(state: PromptStudioState): string {
  return JSON.stringify(normalizePromptStudioState(state));
}

export function hasPromptStudioSelections(state: PromptStudioState): boolean {
  return Object.entries(state).some(([key, value]) => (
    value !== DEFAULT_PROMPT_STUDIO_STATE[key as keyof PromptStudioState]
  ));
}

export function buildGenerationPrompt(prompt: string, state: PromptStudioState): string {
  const trimmed = prompt.trim();
  const normalized = normalizePromptStudioState(state);
  const lines: string[] = [];

  if (normalized.useCase !== 'none') {
    lines.push(`Use case: ${USE_CASE_DIRECTIONS[normalized.useCase]}.`);
  }
  if (normalized.style !== 'none') {
    lines.push(`Style: ${STYLE_DIRECTIONS[normalized.style]}.`);
  }
  if (normalized.shot !== 'none') {
    lines.push(`Shot: ${SHOT_DIRECTIONS[normalized.shot]}.`);
  }
  if (normalized.composition !== 'none') {
    lines.push(`Composition: ${COMPOSITION_DIRECTIONS[normalized.composition]}.`);
  }
  if (normalized.tone !== 'none') {
    lines.push(`Tone: ${TONE_DIRECTIONS[normalized.tone]}.`);
  }
  if (normalized.material !== 'none') {
    lines.push(`Material: ${MATERIAL_DIRECTIONS[normalized.material]}.`);
  }

  if (lines.length === 0) return trimmed;
  return `${trimmed}\n\nCreative direction:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

export function getUseCaseDefaults(useCase: StudioUseCase): Partial<{ aspect: ImageAspect }> {
  switch (useCase) {
    case 'avatar':
    case 'sticker':
    case 'product':
      return { aspect: '1:1' };
    case 'poster':
    case 'cover':
    case 'character':
      return { aspect: 'vertical' };
    case 'wallpaper':
      return { aspect: '16:9' };
    default:
      return {};
  }
}
