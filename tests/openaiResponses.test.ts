import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsesPayload } from '../src/lib/openaiResponses.ts';

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
