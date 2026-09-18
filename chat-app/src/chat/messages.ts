import type { ChatEvent } from '../utils/api-client';

export type ChatMessage = {
  id: string;
  mine: boolean;
  text: string;
  time: string;
  timestamp: string;
  ciphertext: string;
  requestId?: string;
  status: 'sending' | 'published' | 'stored' | 'unconfirmed';
};

export function isChatEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return ['messageId', 'senderId', 'targetId', 'ciphertext', 'timestamp'].every(
    key => typeof message[key] === 'string' && (message[key] as string).length > 0) &&
    Number.isFinite(Date.parse(message.timestamp as string));
}

export function validateParticipants(message: ChatEvent, currentUserId: string): void {
  if (message.senderId === message.targetId ||
      (message.senderId !== currentUserId && message.targetId !== currentUserId))
    throw new Error('Die Nachricht gehört nicht zu diesem Konto.');
  const payload = JSON.parse(message.ciphertext);
  if (payload.senderId !== message.senderId || payload.recipientId !== message.targetId)
    throw new Error('Absender oder Empfänger der verschlüsselten Nachricht stimmt nicht überein.');
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    // If an acknowledgement was lost, ciphertext still identifies the local optimistic message.
    for (const [id, existing] of messages) {
      if (id !== message.id && existing.mine && existing.status !== 'stored' &&
          existing.ciphertext === message.ciphertext) messages.delete(id);
    }
    const existing = messages.get(message.id);
    messages.set(message.id, existing?.status === 'stored' && message.status !== 'stored' ? existing : message);
  }
  return [...messages.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

export function messageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
