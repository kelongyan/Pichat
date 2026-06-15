import type {
  BuildPayloadParams,
  GenerateImageResult,
  Message,
  ProtocolAdapter,
  StreamDelta,
} from '../../types';

interface ResponseOutputItem {
  type: string;
  summary?: Array<{ type: string; text?: string }>;
  content?: Array<{ type: string; text?: string; image_base64?: string; result?: string; b64_json?: string }>;
  result?: string;
  image_base64?: string;
  b64_json?: string;
}

interface ParsedOutput {
  text: string | null;
  imageBase64: string | null;
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

function parseResponseOutput(output: ResponseOutputItem[] | undefined): ParsedOutput {
  let text: string | null = null;
  let imageBase64: string | null = null;

  for (const item of output || []) {
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) {
          text = text ? text + '\n' + part.text : part.text;
        }
        if (part.type === 'output_image') {
          imageBase64 = part.image_base64 || part.result || part.b64_json || imageBase64;
        }
      }
    }
    if (item.type === 'image_generation_call') {
      imageBase64 = item.result || item.image_base64 || item.b64_json || imageBase64;
    }
    if (item.type === 'output_image') {
      imageBase64 = item.image_base64 || item.result || item.b64_json || imageBase64;
    }
  }

  return { text, imageBase64 };
}

function getMessageImageUrls(msg: Message): string[] {
  if (msg.imageDataUrls?.length) return msg.imageDataUrls;
  return msg.imageDataUrl ? [msg.imageDataUrl] : [];
}

function buildInput(prompt: string, images: string[], history: Message[]): InputMessage[] {
  const input: InputMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      const content: InputMessage['content'] = [{ type: 'input_text', text: msg.generationPrompt || msg.text || '' }];
      for (const imageUrl of getMessageImageUrls(msg)) {
        content.push({ type: 'input_image', image_url: imageUrl });
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

function buildResponsesPayload({
  provider,
  prompt,
  size,
  action,
  images,
  history,
  instructions,
  stream,
}: BuildPayloadParams): Record<string, unknown> {
  const tool: ToolConfig = { type: 'image_generation', action };
  if (size && size !== 'auto') {
    tool.size = size;
  }

  const payload: Record<string, unknown> = {
    model: provider.model || 'gpt-image-2',
    input: buildInput(prompt, images, history),
    tools: [tool],
    ...(instructions && { instructions }),
  };

  if (stream) {
    payload.stream = true;
  }

  return payload;
}

export function createResponsesAdapter(): ProtocolAdapter {
  return {
    supportsStreaming: true,
    supportsHistory: true,
    supportsEditing: true,

    getEndpoint: () => '/responses',

    buildPayload(params) {
      return buildResponsesPayload(params);
    },

    async parseResponse(response) {
      const data = await response.json();
      const result = parseResponseOutput(data.output);
      if (!result.text && !result.imageBase64) {
        throw new Error('The API returned an empty response — the model may not support this request, or content was filtered.');
      }
      return { ...result, raw: data };
    },

    async readStream(response, onStream) {
      if (!response.body) {
        throw new Error('Streaming not supported: missing response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accText: string | null = null;
      let accImage: string | null = null;
      let finalData: { response?: { output?: ResponseOutputItem[] }; output?: ResponseOutputItem[] } | null = null;

      const emit = (extra?: Partial<StreamDelta>) => {
        onStream({ text: accText, imageBase64: accImage, ...extra });
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
          const eventDataLines: string[] = [];
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventDataLines.push(line.slice(5).trimStart());
            }
          }

          const eventData = eventDataLines.join('\n');
          if (!eventData || eventData === '[DONE]') continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(eventData);
          } catch {
            continue;
          }

          eventType ||= typeof parsed.type === 'string' ? parsed.type : '';

          if (eventType === 'response.output_item.added') {
            const item = parsed.item as Record<string, unknown> | undefined;
            if (item?.type === 'image_generation_call') {
              emit({ stage: 'generating' });
            }
          } else if (eventType === 'response.output_text.delta') {
            accText = (accText || '') + String(parsed.delta ?? '');
            emit();
          } else if (eventType === 'response.image_generation_call.partial_image') {
            const partialImage = parsed.partial_image_b64;
            if (typeof partialImage === 'string') {
              accImage = partialImage;
              emit({ stage: 'generating' });
            }
          } else if (eventType === 'response.output_item.done') {
            const item = parsed.item as Record<string, unknown> | undefined;
            if (item?.type === 'image_generation_call') {
              const imageValue = item.result || item.image_base64 || item.b64_json;
              if (typeof imageValue === 'string') accImage = imageValue;
              emit();
            }
            if (item?.type === 'output_image') {
              const imageValue = item.image_base64 || item.result || item.b64_json;
              if (typeof imageValue === 'string') accImage = imageValue;
              emit();
            }
          } else if (eventType === 'response.completed') {
            finalData = parsed as { response?: { output?: ResponseOutputItem[] }; output?: ResponseOutputItem[] };
            emit({ done: true, stage: 'complete' });
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
          raw: finalData,
        };
      }

      if (!accText && !accImage) {
        throw new Error('The API stream ended without content — the model may not support this request, or content was filtered.');
      }

      return { text: accText, imageBase64: accImage, raw: null };
    },
  };
}
