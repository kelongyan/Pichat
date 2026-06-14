import type { Conversation, Message } from '../types';

export function cloneConversation(conversation: Conversation): Conversation {
  return JSON.parse(JSON.stringify(conversation)) as Conversation;
}

function collectMessageImageIds(msg: Message, ids: Set<string>): void {
  if (msg.variants) {
    for (const variant of msg.variants) {
      if (variant.imageId) ids.add(variant.imageId);
    }
  }
}

export function collectConversationImageIds(conversations: Conversation[]): string[] {
  const ids = new Set<string>();
  for (const conversation of conversations) {
    for (const msg of conversation.messages) {
      collectMessageImageIds(msg, ids);
    }
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

export function remapConversationImageIds(conversation: Conversation, imageIdMap: Map<string, string>): Conversation {
  const cloned = cloneConversation(conversation);
  for (const msg of cloned.messages) {
    if (!msg.variants) continue;
    for (const variant of msg.variants) {
      if (variant.imageId && imageIdMap.has(variant.imageId)) {
        variant.imageId = imageIdMap.get(variant.imageId);
      }
    }
  }
  return cloned;
}
