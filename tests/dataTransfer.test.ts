import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectConversationImageIds,
  remapConversationImageIds,
} from '../src/lib/dataTransferCore.ts';
import type { Conversation } from '../src/types.ts';

const conversation: Conversation = {
  id: 'conv',
  createdAt: 1,
  messages: [
    {
      role: 'assistant',
      timestamp: 2,
      variants: [
        { imageId: 'old-a', size: '1024x1024', timestamp: 2 },
        { imageId: 'old-b', size: '1024x1024', timestamp: 3 },
      ],
    },
  ],
};

test('collectConversationImageIds returns unique referenced image ids', () => {
  assert.deepEqual(collectConversationImageIds([conversation]), ['old-a', 'old-b']);
});

test('remapConversationImageIds replaces imported image ids without mutating source', () => {
  const remapped = remapConversationImageIds(conversation, new Map([
    ['old-a', 'new-a'],
    ['old-b', 'new-b'],
  ]));

  assert.equal(remapped.messages[0].variants?.[0].imageId, 'new-a');
  assert.equal(remapped.messages[0].variants?.[1].imageId, 'new-b');
  assert.equal(conversation.messages[0].variants?.[0].imageId, 'old-a');
});
