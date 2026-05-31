export type ImageAspect = 'auto' | '1:1' | '16:9' | '4:3' | 'wide' | 'vertical' | 'custom';
export type ImageResolution = 'standard' | 'hd' | '2k' | '4k';

export interface PresetOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export const ASPECT_OPTIONS: PresetOption<ImageAspect>[] = [
  { value: 'auto', label: 'Auto', title: 'Let the model choose the best ratio' },
  { value: '1:1', label: '1:1', title: 'Square image' },
  { value: '16:9', label: '16:9', title: 'Wide horizontal image' },
  { value: '4:3', label: '4:3', title: 'Classic horizontal image' },
  { value: 'wide', label: '宽屏', title: 'Wide screen horizontal image' },
  { value: 'vertical', label: '竖屏', title: 'Vertical screen image' },
  { value: 'custom', label: 'Custom', title: 'Use a custom width and height' },
];

export const RESOLUTION_OPTIONS: PresetOption<ImageResolution>[] = [
  { value: 'standard', label: 'Std', title: 'Standard generation size' },
  { value: 'hd', label: 'HD', title: 'Higher detail size' },
  { value: '2k', label: '2K', title: '2K output size' },
  { value: '4k', label: '4K', title: '4K output size' },
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
  '4:3': {
    standard: '1536x1152',
    hd: '1600x1200',
    '2k': '2048x1536',
    '4k': '3840x2880',
  },
  wide: {
    standard: '1536x1024',
    hd: '1920x1280',
    '2k': '2560x1707',
    '4k': '3840x2560',
  },
  vertical: {
    standard: '1024x1536',
    hd: '1280x1920',
    '2k': '1440x2560',
    '4k': '2160x3840',
  },
};

export function resolveImageSize(aspect: ImageAspect, resolution: ImageResolution): string {
  if (aspect === 'custom') return SIZE_MATRIX['1:1'][resolution];
  return SIZE_MATRIX[aspect][resolution];
}
