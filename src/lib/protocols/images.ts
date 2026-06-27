import type {
  BuildPayloadParams,
  GenerateImageResult,
  ProtocolAdapter,
} from '../../types';
import { normalizeImagesResponse } from './generationResponse.ts';

export function createImagesAdapter(): ProtocolAdapter {
  return {
    supportsStreaming: false,
    supportsHistory: false,
    supportsEditing: false,

    getEndpoint: () => '/images/generations',

    buildPayload(params) {
      // 对话历史降级：拼接历史上下文
      let prompt = params.prompt;
      if (params.history.length > 0) {
        const contextParts = params.history
          .filter((m) => m.role === 'user')
          .slice(-3)
          .map((m) => m.text || m.generationPrompt || '')
          .filter(Boolean);
        if (contextParts.length > 0) {
          prompt = `Previous context: ${contextParts.join(' | ')}\n\nNew request: ${prompt}`;
        }
      }

      // 参考图降级：拼接提示
      if (params.images.length > 0) {
        prompt = `${prompt}\n\n[Reference images attached for style/editing context]`;
      }

      const payload: Record<string, unknown> = {
        model: params.provider.model || 'gpt-image-2',
        prompt,
        n: 1,
        response_format: 'b64_json',
      };

      if (params.size && params.size !== 'auto') {
        payload.size = params.size;
      }

      return payload;
    },

    async parseResponse(response) {
      const data = await response.json();
      const result = normalizeImagesResponse(data);
      return { text: result.text, imageSource: result.imageSource, imageBase64: result.imageSource, raw: data };
    },
  };
}
