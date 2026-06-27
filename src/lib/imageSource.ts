export function stripDataUrlPrefix(value: string): string {
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  return match ? match[2] : value;
}

export function inferImageMime(value: string): string {
  const dataUrlMatch = value.match(/^data:([^;,]+)(?:;base64)?,/);
  if (dataUrlMatch?.[1]) return dataUrlMatch[1];

  const base64 = stripDataUrlPrefix(value);
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('PD94bWwg') || base64.startsWith('PHN2Zy')) return 'image/svg+xml';
  return 'image/png';
}

export function toImageDataUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:')) return value;
  return `data:${inferImageMime(value)};base64,${stripDataUrlPrefix(value)}`;
}

function base64ToBlob(base64: string, mime = inferImageMime(base64)): Blob {
  const normalized = stripDataUrlPrefix(base64);
  const byteString = atob(normalized);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

export async function imageSourceToBlob(value: string): Promise<Blob> {
  const source = value.trim();
  if (/^https?:\/\//i.test(source) || source.startsWith('blob:')) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Could not fetch generated image URL (HTTP ${response.status})`);
    }
    return response.blob();
  }
  return base64ToBlob(source);
}
