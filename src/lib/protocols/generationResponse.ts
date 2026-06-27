export interface NormalizedGenerationResponse {
  text: string | null;
  imageSource: string | null;
}

interface ResponseOutputItem {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    image_base64?: string;
    result?: string;
    b64_json?: string;
    url?: string;
  }>;
  result?: string;
  image_base64?: string;
  b64_json?: string;
  url?: string;
}

interface ImageSourceCarrier {
  result?: unknown;
  image_base64?: unknown;
  b64_json?: unknown;
  url?: unknown;
}

function appendText(current: string | null, next?: string): string | null {
  if (!next) return current;
  return current ? `${current}\n${next}` : next;
}

function getImageSource(value: ImageSourceCarrier): string | null {
  for (const key of ['result', 'image_base64', 'b64_json', 'url'] as const) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  return null;
}

export function normalizeResponsesResponse(raw: unknown): NormalizedGenerationResponse {
  const data = raw as { output?: ResponseOutputItem[]; response?: { output?: ResponseOutputItem[] } };
  const output = data.response?.output || data.output || [];
  let text: string | null = null;
  let imageSource: string | null = null;

  for (const item of output) {
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text') {
          text = appendText(text, part.text);
        }
        if (part.type === 'output_image') {
          imageSource = getImageSource(part) || imageSource;
        }
      }
    }

    if (item.type === 'image_generation_call' || item.type === 'output_image') {
      imageSource = getImageSource(item) || imageSource;
    }
  }

  return { text, imageSource };
}

export function normalizeImagesResponse(raw: unknown): NormalizedGenerationResponse {
  const data = raw as { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
  const first = Array.isArray(data.data) ? data.data[0] : undefined;
  return {
    text: first?.revised_prompt || null,
    imageSource: first?.b64_json || first?.url || null,
  };
}
