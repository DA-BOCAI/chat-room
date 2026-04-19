import type { Message } from '@/types/types';

const ROOM_MESSAGE_CACHE_PREFIX = 'room-message-cache';
const MAX_CACHED_MESSAGES = 200;

export const isTempMessageId = (messageId: string): boolean =>
  messageId.startsWith('temp-') || messageId.startsWith('ai-temp-');

export function binarySearchInsert(messages: Message[], newTime: number): number {
  let left = 0;
  let right = messages.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const messageTime = new Date(messages[mid].created_at).getTime();

    if (messageTime < newTime) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

export function insertMessageChronologically(messages: Message[], message: Message): Message[] {
  if (messages.length === 0) {
    return [message];
  }

  const newTime = new Date(message.created_at).getTime();
  const lastMessage = messages[messages.length - 1];
  const lastTime = new Date(lastMessage.created_at).getTime();

  if (newTime >= lastTime) {
    return [...messages, message];
  }

  const insertIndex = binarySearchInsert(messages, newTime);
  const nextMessages = [...messages];
  nextMessages.splice(insertIndex, 0, message);
  return nextMessages;
}

function isMatchingTempMessage(candidate: Message, incoming: Message): boolean {
  if (!isTempMessageId(candidate.id)) {
    return false;
  }

  if (candidate.user_id !== incoming.user_id) {
    return false;
  }

  if (Boolean(candidate.is_ai) !== Boolean(incoming.is_ai)) {
    return false;
  }

  if (Boolean(candidate.is_warning) !== Boolean(incoming.is_warning)) {
    return false;
  }

  const candidateContent = candidate.content.trim();
  const incomingContent = incoming.content.trim();

  if (!candidate.is_ai) {
    return candidateContent === incomingContent;
  }

  if (!candidateContent || !incomingContent) {
    return true;
  }

  return incomingContent.startsWith(candidateContent) || candidateContent.startsWith(incomingContent);
}

export function reconcileIncomingMessage(messages: Message[], incoming: Message): Message[] {
  const existingIndex = messages.findIndex((message) => message.id === incoming.id);
  if (existingIndex !== -1) {
    const updatedMessage = {
      ...messages[existingIndex],
      ...incoming,
      profile: incoming.profile || messages[existingIndex].profile,
    };
    const remainingMessages = messages.filter((message) => message.id !== incoming.id);
    return insertMessageChronologically(remainingMessages, updatedMessage);
  }

  const tempIndex = messages.findIndex((message) => isMatchingTempMessage(message, incoming));
  if (tempIndex !== -1) {
    const updatedMessage = {
      ...messages[tempIndex],
      ...incoming,
      profile: incoming.profile || messages[tempIndex].profile,
    };
    const remainingMessages = messages.filter((message) => message.id !== messages[tempIndex].id);
    return insertMessageChronologically(remainingMessages, updatedMessage);
  }

  return insertMessageChronologically(messages, incoming);
}

export function confirmTempMessage(
  messages: Message[],
  tempId: string,
  persisted: Pick<Message, 'id'> & Partial<Pick<Message, 'created_at' | 'content' | 'profile'>>
): Message[] {
  const tempIndex = messages.findIndex((message) => message.id === tempId);
  if (tempIndex === -1) {
    return messages;
  }

  const updatedMessage = {
    ...messages[tempIndex],
    ...persisted,
    profile: persisted.profile || messages[tempIndex].profile,
  };
  const remainingMessages = messages.filter((message) => message.id !== tempId);
  return insertMessageChronologically(remainingMessages, updatedMessage);
}

export function mergeHydratedMessages(cachedMessages: Message[], serverMessages: Message[]): Message[] {
  return serverMessages.reduce((merged, message) => reconcileIncomingMessage(merged, message), cachedMessages);
}

function getRoomMessageCacheKey(roomId: string): string {
  return `${ROOM_MESSAGE_CACHE_PREFIX}:${roomId}`;
}

export function readCachedRoomMessages(roomId: string): Message[] {
  try {
    const raw = sessionStorage.getItem(getRoomMessageCacheKey(roomId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read room message cache:', error);
    return [];
  }
}

export function writeCachedRoomMessages(roomId: string, messages: Message[]): void {
  try {
    const normalizedMessages = messages.reduce<Message[]>((merged, message) => {
      return reconcileIncomingMessage(merged, message);
    }, []);

    sessionStorage.setItem(
      getRoomMessageCacheKey(roomId),
      JSON.stringify(normalizedMessages.slice(-MAX_CACHED_MESSAGES))
    );
  } catch (error) {
    console.warn('Failed to write room message cache:', error);
  }
}
