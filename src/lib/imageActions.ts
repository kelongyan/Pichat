export type ImageAction =
  | 'copy'
  | 'same'
  | 'style'
  | 'background'
  | 'ratio'
  | 'realistic'
  | 'illustration'
  | 'clean'
  | 'cinematic';

const LABELS: Record<ImageAction, string> = {
  copy: 'Copy',
  same: 'Same',
  style: 'Style',
  background: 'Background',
  ratio: 'Ratio',
  realistic: 'Real',
  illustration: 'Illustration',
  clean: 'Clean',
  cinematic: 'Cinematic',
};

function suffix(originalPrompt?: string): string {
  const trimmed = originalPrompt?.trim();
  return trimmed ? `\n\nOriginal prompt: ${trimmed}` : '';
}

export function getImageActionLabel(action: ImageAction): string {
  return LABELS[action];
}

export function buildImageActionPrompt(action: Exclude<ImageAction, 'copy'>, originalPrompt?: string): string {
  switch (action) {
    case 'same':
      return `Create another variation from the attached image. Keep the strongest visual idea, composition, and mood, but make it feel like a fresh alternate take.${suffix(originalPrompt)}`;
    case 'style':
      return `Use the attached image as a style reference. Keep the subject direction from the original prompt, but translate it into a new coherent visual style.${suffix(originalPrompt)}`;
    case 'background':
      return `Change the background of the attached image while preserving the main subject, pose, silhouette, and overall image quality.${suffix(originalPrompt)}`;
    case 'ratio':
      return `Recompose this image for a new aspect ratio. Preserve the main subject and visual identity, then adjust framing so the image feels intentionally composed.${suffix(originalPrompt)}`;
    case 'realistic':
      return `Make the attached image more photorealistic while preserving the main subject, composition, and mood.${suffix(originalPrompt)}`;
    case 'illustration':
      return `Turn the attached image into a polished illustration while preserving the subject, composition, and mood.${suffix(originalPrompt)}`;
    case 'clean':
      return `Make the attached image cleaner and more polished. Reduce visual clutter, improve readability, and preserve the main subject.${suffix(originalPrompt)}`;
    case 'cinematic':
      return `Make the attached image more cinematic with stronger lighting, depth, and atmosphere while preserving the core subject.${suffix(originalPrompt)}`;
  }
}
