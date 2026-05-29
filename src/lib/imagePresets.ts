export type ImageAspect = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'custom';
export type ImageResolution = 'standard' | 'hd' | '2k' | '4k';
export type QuickPreset = 'none' | 'avatar-circle' | 'avatar-square' | 'landscape' | 'portrait';

export interface PresetOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export const ASPECT_OPTIONS: PresetOption<ImageAspect>[] = [
  { value: 'auto', label: 'Auto', title: 'Let the model choose the best ratio' },
  { value: '1:1', label: '1:1', title: 'Square image' },
  { value: '16:9', label: '16:9', title: 'Wide horizontal image' },
  { value: '9:16', label: '9:16', title: 'Vertical image' },
  { value: '4:3', label: '4:3', title: 'Classic horizontal image' },
  { value: '3:4', label: '3:4', title: 'Classic vertical image' },
  { value: 'custom', label: 'Custom', title: 'Use a custom width and height' },
];

export const RESOLUTION_OPTIONS: PresetOption<ImageResolution>[] = [
  { value: 'standard', label: 'Std', title: 'Standard generation size' },
  { value: 'hd', label: 'HD', title: 'Higher detail size' },
  { value: '2k', label: '2K', title: '2K output size' },
  { value: '4k', label: '4K', title: '4K output size' },
];

export const QUICK_PRESET_OPTIONS: PresetOption<Exclude<QuickPreset, 'none'>>[] = [
  { value: 'avatar-circle', label: 'Circle Avatar', title: 'Optimized for round profile pictures' },
  { value: 'avatar-square', label: 'Square Avatar', title: 'Optimized for square profile pictures' },
  { value: 'landscape', label: 'Wide', title: 'Wide horizontal composition' },
  { value: 'portrait', label: 'Tall', title: 'Tall vertical composition' },
];

const SIZE_MATRIX: Record<Exclude<ImageAspect, 'custom'>, Record<ImageResolution, string>> = {
  auto: {
    standard: 'auto',
    hd: 'auto',
    '2k': 'auto',
    '4k': 'auto',
  },
  '1:1': {
    standard: '1024x1024',
    hd: '1536x1536',
    '2k': '2048x2048',
    '4k': '4096x4096',
  },
  '16:9': {
    standard: '1792x1024',
    hd: '1920x1080',
    '2k': '2560x1440',
    '4k': '3840x2160',
  },
  '9:16': {
    standard: '1024x1792',
    hd: '1080x1920',
    '2k': '1440x2560',
    '4k': '2160x3840',
  },
  '4:3': {
    standard: '1536x1152',
    hd: '1600x1200',
    '2k': '2048x1536',
    '4k': '3840x2880',
  },
  '3:4': {
    standard: '1152x1536',
    hd: '1200x1600',
    '2k': '1536x2048',
    '4k': '2880x3840',
  },
};

const QUICK_PRESET_PROMPTS: Record<Exclude<QuickPreset, 'none'>, string> = {
  'avatar-circle':
    'Quick preset: circular profile avatar. Create a centered subject with generous safe margins for circular cropping, clean background, balanced lighting, no text, no watermark, no border.',
  'avatar-square':
    'Quick preset: square profile avatar. Create a centered subject that reads clearly at small size, clean background, balanced lighting, no text, no watermark, no border.',
  landscape:
    'Quick preset: wide horizontal composition. Use a cinematic 16:9 landscape framing with clear left-to-right composition and no text unless requested.',
  portrait:
    'Quick preset: tall vertical composition. Use a strong 9:16 portrait framing with clear subject hierarchy and no text unless requested.',
};

export function resolveImageSize(aspect: ImageAspect, resolution: ImageResolution): string {
  if (aspect === 'custom') return SIZE_MATRIX['1:1'][resolution];
  return SIZE_MATRIX[aspect][resolution];
}

export function getQuickPresetDefaults(preset: QuickPreset): Partial<{ aspect: ImageAspect }> {
  switch (preset) {
    case 'avatar-circle':
    case 'avatar-square':
      return { aspect: '1:1' };
    case 'landscape':
      return { aspect: '16:9' };
    case 'portrait':
      return { aspect: '9:16' };
    default:
      return {};
  }
}

export function applyQuickPresetToPrompt(prompt: string, preset: QuickPreset): string {
  const trimmed = prompt.trim();
  if (preset === 'none') return trimmed;
  return `${trimmed}\n\n${QUICK_PRESET_PROMPTS[preset]}`;
}
