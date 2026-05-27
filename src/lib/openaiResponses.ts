import type {
  Config,
  GenerateImageParams,
  GenerateImageResult,
  Message,
  ProviderConfig,
  StreamDelta,
} from '../types';

interface ResponseOutputItem {
  type: string;
  summary?: Array<{ type: string; text?: string }>;
  content?: Array<{ type: string; text?: string }>;
  result?: string;
}

interface ParsedOutput {
  text: string | null;
  imageBase64: string | null;
  thinking: string | null;
}

interface InputMessage {
  role: 'user' | 'assistant';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string }
    | { type: 'output_text'; text: string }
  >;
}

interface ToolConfig {
  type: 'image_generation';
  action: string;
  size?: string;
}

interface ReasoningConfig {
  effort: string;
  generate_summary?: string;
}

interface RequestPayload {
  model: string;
  input: InputMessage[];
  tools: ToolConfig[];
  instructions?: string;
  reasoning?: ReasoningConfig;
  stream?: boolean;
}

interface BuildResponsesPayloadParams {
  config: Config;
  provider: ProviderConfig;
  prompt: string;
  size: string;
  action: string;
  images: string[];
  thinking?: string;
  history: Message[];
  instructions: string;
  stream: boolean;
}

function parseResponseOutput(output: ResponseOutputItem[] | undefined): ParsedOutput {
  let text: string | null = null;
  let imageBase64: string | null = null;
  let thinking: string | null = null;

  for (const item of output || []) {
    if (item.type === 'reasoning' && item.summary) {
      for (const part of item.summary) {
        if (part.type === 'summary_text' && part.text) {
          thinking = thinking ? thinking + '\n' + part.text : part.text;
        }
      }
    }
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) {
          text = text ? text + '\n' + part.text : part.text;
        }
      }
    }
    if (item.type === 'image_generation_call' && item.result) {
      imageBase64 = item.result;
    }
  }

  return { text, imageBase64, thinking };
}

function buildInput(prompt: string, images: string[], history: Message[]): InputMessage[] {
  const input: InputMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      const content: InputMessage['content'] = [{ type: 'input_text', text: msg.text || '' }];
      if (msg.imageDataUrl) {
        content.push({ type: 'input_image', image_url: msg.imageDataUrl });
      }
      input.push({ role: 'user', content });
    } else if (msg.role === 'assistant' && !msg.error) {
      const variant = msg.variants?.[msg.activeVariant || 0] || msg.variants?.[0];
      if (variant?.text) {
        input.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: variant.text }],
        });
      }
    }
  }

  const currentContent: InputMessage['content'] = [{ type: 'input_text', text: prompt }];
  for (const dataUrl of images) {
    currentContent.push({ type: 'input_image', image_url: dataUrl });
  }
  input.push({ role: 'user', content: currentContent });

  return input;
}

export function buildResponsesPayload({
  config,
  provider,
  prompt,
  size,
  action,
  images,
  thinking,
  history,
  instructions,
  stream,
}: BuildResponsesPayloadParams): RequestPayload {
  const tool: ToolConfig = { type: 'image_generation', action };
  if (size && size !== 'auto') {
    tool.size = size;
  }

  const payload: RequestPayload = {
    model: provider.model || 'gpt-5.4',
    input: buildInput(prompt, images, history),
    tools: [tool],
    ...(instructions && { instructions }),
  };

  if (thinking && thinking !== 'none') {
    const reasoning: ReasoningConfig = { effort: thinking };
    if (config.showThinking) {
      reasoning.generate_summary = 'concise';
    }
    payload.reasoning = reasoning;
  }

  if (stream) {
    payload.stream = true;
  }

  return payload;
}

export async function parseResponsesJson(response: Response): Promise<GenerateImageResult> {
  const data = await response.json();
  const result = parseResponseOutput(data.output);
  if (!result.text && !result.imageBase64) {
    throw new Error('The API returned an empty response — the model may not support this request, or content was filtered.');
  }
  return { ...result, raw: data };
}

export async function readResponsesStream(
  response: Response,
  onStream: NonNullable<GenerateImageParams['onStream']>,
): Promise<GenerateImageResult> {
  if (!response.body) {
    throw new Error('Streaming not supported: missing response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accText: string | null = null;
  let accThinking: string | null = null;
  let accImage: string | null = null;
  let finalData: { response?: { output?: ResponseOutputItem[] }; output?: ResponseOutputItem[] } | null = null;

  const emit = (extra?: Partial<StreamDelta>) => {
    onStream({ text: accText, thinking: accThinking, imageBase64: accImage, ...extra });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.trim()) continue;

      let eventType = '';
      let eventData = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
        }
      }

      if (!eventData || eventData === '[DONE]') continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(eventData);
      } catch {
        continue;
      }

      if (eventType === 'response.output_text.delta') {
        accText = (accText || '') + String(parsed.delta ?? '');
        emit();
      } else if (eventType === 'response.reasoning_summary_text.delta') {
        accThinking = (accThinking || '') + String(parsed.delta ?? '');
        emit();
      } else if (eventType === 'response.output_item.done') {
        const item = parsed.item as Record<string, unknown> | undefined;
        if (item?.type === 'image_generation_call' && typeof item.result === 'string') {
          accImage = item.result;
          emit();
        }
      } else if (eventType === 'response.completed') {
        finalData = parsed as { response?: { output?: ResponseOutputItem[] }; output?: ResponseOutputItem[] };
        emit({ done: true });
      } else if (eventType === 'response.failed') {
        const errObj = parsed.error as Record<string, unknown> | undefined;
        const failMsg = String(errObj?.message ?? 'Generation failed');
        if (failMsg.includes('rate') || failMsg.includes('limit')) {
          throw new Error('Rate limit exceeded — please wait a moment and try again.');
        }
        if (failMsg.includes('content_policy') || failMsg.includes('filter')) {
          throw new Error('Content was filtered by the API safety policy. Try rephrasing your prompt.');
        }
        throw new Error(`Generation failed: ${failMsg}`);
      }
    }
  }

  if (finalData) {
    const output = finalData.response?.output || finalData.output;
    const result = parseResponseOutput(output);
    return {
      text: result.text ?? accText,
      imageBase64: result.imageBase64 ?? accImage,
      thinking: result.thinking ?? accThinking,
      raw: finalData,
    };
  }

  if (!accText && !accImage) {
    throw new Error('The API stream ended without content — the model may not support this request, or content was filtered.');
  }

  return { text: accText, imageBase64: accImage, thinking: accThinking, raw: null };
}
