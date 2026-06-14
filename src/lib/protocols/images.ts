import type {
  BuildPayloadParams,
  GenerateImageResult,
  ProtocolAdapter,
} from '../../types';

export function createImagesAdapter(): ProtocolAdapter {
  return {
    supportsStreaming: false,
    supportsHistory: false,
    supportsThinking: false,
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
      const imageBase64 = data.data?.[0]?.b64_json || data.data?.[0]?.url || null;
      const text = data.data?.[0]?.revised_prompt || null;
      return { text, imageBase64, thinking: null, raw: data };
    },
  };
}
