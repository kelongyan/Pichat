import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsesPayload, readResponsesStream } from '../src/lib/openaiResponses.ts';

const config = {
  providers: [],
  defaultProviderId: 'p1',
  showThinking: false,
  thinkingLevel: 'low',
  darkMode: false,
  useSystemPrompt: true,
};

const provider = {
  id: 'p1',
  name: 'Provider',
  baseURL: 'https://example.test/v1',
  apiKey: 'sk-test',
  model: 'gpt-image-test',
  createdAt: 1,
  updatedAt: 1,
};

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }));
}

test('buildResponsesPayload uses generationPrompt and all stored reference images in history', () => {
  const payload = buildResponsesPayload({
    config,
    provider,
    prompt: 'current display prompt',
    size: '1024x1024',
    action: 'edit',
    images: ['data:image/png;base64,current'],
    thinking: 'low',
    history: [
      {
        role: 'user',
        text: 'display prompt',
        generationPrompt: 'expanded generation prompt',
        imageDataUrls: [
          'data:image/png;base64,history-one',
          'data:image/png;base64,history-two',
        ],
        timestamp: 1,
      },
    ],
    instructions: 'system',
    stream: false,
  });

  assert.equal(payload.input[0].content[0].text, 'expanded generation prompt');
  assert.equal(payload.input[0].content[1].image_url, 'data:image/png;base64,history-one');
  assert.equal(payload.input[0].content[2].image_url, 'data:image/png;base64,history-two');
  assert.equal(payload.input[1].content[1].image_url, 'data:image/png;base64,current');
  assert.equal(payload.tools[0].action, 'edit');
});

test('buildResponsesPayload omits auto size from image_generation tool payload', () => {
  const payload = buildResponsesPayload({
    config,
    provider,
    prompt: 'A small cottage',
    size: 'auto',
    action: 'auto',
    images: [],
    history: [],
    instructions: '',
    stream: false,
  });

  assert.equal('size' in payload.tools[0], false);
});

test('readResponsesStream accepts typed data-only SSE events', async () => {
  const deltas: Array<{ text: string | null; imageBase64: string | null; done?: boolean }> = [];
  const response = streamResponse([
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'draft ' })}\n\n`,
    `data: ${JSON.stringify({ type: 'response.image_generation_call.partial_image', partial_image_b64: 'partial-image' })}\n\n`,
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: {
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'final text' }] },
          { type: 'image_generation_call', result: 'final-image' },
        ],
      },
    })}\n\n`,
  ]);

  const result = await readResponsesStream(response, (delta) => {
    deltas.push({
      text: delta.text,
      imageBase64: delta.imageBase64,
      done: delta.done,
    });
  });

  assert.equal(result.text, 'final text');
  assert.equal(result.imageBase64, 'final-image');
  assert.equal(deltas.at(-1)?.done, true);
});
