/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { ensureE2eeIdentity, encryptMessageForUser, decryptMessageForCurrentUser } from '../src/e2ee/e2ee';
import { mergeMessages, validateParticipants, type ChatMessage } from '../src/chat/messages';

test('E2EE round trip, sent history, retained keys, tamper detection, and no silent key replacement', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const directory = new Map<string, { userId: string; keyId: string; publicKey: string; updatedAt: string }>();
  let publications = 0;
  const browser = { crypto: webcrypto, indexedDB: new IDBFactory(), btoa, atob };
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true, writable: true });
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const headers = init?.headers as Record<string, string>;
    if (init?.method === 'PUT') {
      const userId = headers.Authorization.replace('Bearer ', '');
      const { publicKey } = JSON.parse(String(init.body));
      const bytes = Buffer.from(publicKey, 'base64url');
      const digest = await webcrypto.subtle.digest('SHA-256', bytes);
      const entry = { userId, publicKey, keyId: `sha256:${Buffer.from(digest).toString('base64url')}`, updatedAt: new Date().toISOString() };
      directory.set(userId, entry); publications++;
      return Response.json(entry);
    }
    const userId = path.split('/').at(-2)!;
    return directory.has(userId) ? Response.json(directory.get(userId)) : Response.json({}, { status: 404 });
  };
  try {
    const alice = await ensureE2eeIdentity('alice', 'alice');
    const bob = await ensureE2eeIdentity('bob', 'bob');
    const encrypted = await encryptMessageForUser(alice, 'bob', 'Hallo geheim!', 'alice');
    assert.equal(encrypted.includes('Hallo geheim!'), false);
    assert.equal(await decryptMessageForCurrentUser(bob, encrypted, 'bob'), 'Hallo geheim!');
    assert.equal(await decryptMessageForCurrentUser(alice, encrypted, 'alice'), 'Hallo geheim!');
    const restored = await ensureE2eeIdentity('alice', 'alice');
    assert.equal(restored.keyId, alice.keyId);
    assert.equal(publications, 2);
    assert.equal(await decryptMessageForCurrentUser(restored, encrypted, 'alice'), 'Hallo geheim!');
    const modified = JSON.parse(encrypted);
    modified.ciphertext = (modified.ciphertext[0] === 'A' ? 'B' : 'A') + modified.ciphertext.slice(1);
    await assert.rejects(decryptMessageForCurrentUser(bob, JSON.stringify(modified), 'bob'), /verändert|Schlüssel/);
    browser.indexedDB = new IDBFactory();
    await assert.rejects(ensureE2eeIdentity('alice', 'alice'), /anderen Browser/);
    assert.equal(publications, 2);
    await assert.rejects(encryptMessageForUser(alice, 'never-logged-in', 'hello', 'alice'));
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
  }
});

const sent: ChatMessage = { id: 'pending:1', mine: true, text: 'hello', time: 'now',
  ciphertext: 'unique-iv-and-ciphertext', timestamp: '2026-09-18T12:00:00Z', status: 'sending', requestId: '1' };
test('history/live merge removes optimistic copies and duplicate deliveries', () => {
  const stored = { ...sent, id: 'server-id', status: 'stored' as const };
  assert.deepEqual(mergeMessages([sent], [stored, stored]), [stored]);
});
test('a late published acknowledgement cannot downgrade a stored message', () => {
  const stored = { ...sent, id: 'server-id', status: 'stored' as const };
  assert.deepEqual(mergeMessages([stored], [{ ...stored, status: 'published' }]), [stored]);
});

test('history and duplicate delivery preserve unread counts and already-read messages', () => {
  const received = { ...sent, id: 'received-id', mine: false, status: 'stored' as const, unread: true };
  const history = { ...received, unread: false };
  const merged = mergeMessages([received], [received, history]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].unread, true);
  assert.equal(mergeMessages([history], [received])[0].unread, false);
});
test('message order is stable for identical timestamps', () => {
  const a = { ...sent, id: 'a', ciphertext: 'a', status: 'stored' as const };
  const b = { ...sent, id: 'b', ciphertext: 'b', status: 'stored' as const };
  assert.deepEqual(mergeMessages([b], [a]).map(message => message.id), ['a', 'b']);
});
test('outer and encrypted participants must match; unrelated accounts are rejected', () => {
  const event = { messageId: '1', senderId: 'alice', targetId: 'bob', timestamp: sent.timestamp,
    ciphertext: JSON.stringify({ senderId: 'alice', recipientId: 'bob' }) };
  validateParticipants(event, 'alice'); validateParticipants(event, 'bob');
  assert.throws(() => validateParticipants(event, 'charlie'));
  assert.throws(() => validateParticipants({ ...event, senderId: 'charlie' }, 'bob'));
});
