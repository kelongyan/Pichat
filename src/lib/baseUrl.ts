export function normalizeApiBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return trimmed;
  }
}

export function getApiBaseURLCandidates(value: string): string[] {
  const primary = normalizeApiBaseURL(value);
  if (!primary) return [];

  const candidates = [primary];
  try {
    const url = new URL(primary);
    const path = url.pathname.replace(/\/+$/, '');
    if (!path.toLowerCase().endsWith('/v1')) {
      url.pathname = `${path}/v1`;
      candidates.push(normalizeApiBaseURL(url.toString()));
    }
  } catch {
    // Keep the configured value only if URL parsing fails.
  }

  return Array.from(new Set(candidates));
}

export function isJsonContentType(contentType: string | null): boolean {
  const lower = (contentType || '').toLowerCase();
  return lower.includes('application/json') || lower.includes('+json');
}

export function isHtmlContentType(contentType: string | null): boolean {
  return (contentType || '').toLowerCase().includes('text/html');
}
