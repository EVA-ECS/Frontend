import { act, renderHook } from '@testing-library/react-native';
import { usePrivateChat } from '../../src/chat/use-private-chat';
import { decryptMessageForCurrentUser, encryptMessageForUser, ensureE2eeIdentity, type LocalE2eeIdentity } from '../../src/e2ee/e2ee';
import { getChatHistory, type ChatEvent } from '../../src/utils/api-client';

jest.mock('../../src/e2ee/e2ee', () => ({ decryptMessageForCurrentUser: jest.fn(), encryptMessageForUser: jest.fn(), ensureE2eeIdentity: jest.fn() }));
jest.mock('../../src/utils/api-client', () => ({ GATEWAY_WS_URL: 'ws://example.invalid', getChatHistory: jest.fn() }));
const identity = { userId: 'alice', keyId: 'alice-key' } as LocalE2eeIdentity;
const ciphertext = JSON.stringify({ senderId: 'alice', recipientId: 'bob' });
const event = (id = 'stored', mine = false): ChatEvent => ({ messageId: id, senderId: mine ? 'alice' : 'bob', targetId: mine ? 'bob' : 'alice', ciphertext: JSON.stringify({ senderId: mine ? 'alice' : 'bob', recipientId: mine ? 'bob' : 'alice' }), timestamp: '2026-09-18T12:00:00Z' });
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => { this.readyState = 3; this.onclose?.({ code: 1000 }); });
  constructor(public url: string) { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  disconnect(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}
const getToken = jest.fn<Promise<string | null>, []>();
const notify = jest.fn();
async function flush() { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); }
async function start(selected: string | null = null, visible: string | null = selected) {
  const hook = await renderHook(() => usePrivateChat('alice', selected, getToken, notify, visible));
  await flush();
  const socket = Socket.instances.at(-1)!;
  await act(() => socket.open());
  await flush();
  return { ...hook, socket };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  for (const mock of [getToken, jest.mocked(ensureE2eeIdentity), jest.mocked(encryptMessageForUser), jest.mocked(decryptMessageForCurrentUser), jest.mocked(getChatHistory)]) mock.mockReset();
  Socket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', { value: Socket, writable: true, configurable: true });
  getToken.mockResolvedValue('a token');
  jest.mocked(ensureE2eeIdentity).mockResolvedValue(identity);
  jest.mocked(encryptMessageForUser).mockResolvedValue(ciphertext);
  jest.mocked(decryptMessageForCurrentUser).mockResolvedValue('decrypted');
  jest.mocked(getChatHistory).mockResolvedValue({ messages: [], nextCursor: null });
});
afterEach(() => jest.useRealTimers());

test('anonymous and missing-token sessions never initialize crypto or sockets', async () => {
  const hook = await renderHook(() => usePrivateChat(undefined, null, getToken, notify));
  await act(async () => expect(await hook.result.current.sendMessage('bob', 'hello')).toBe(false));
  expect(ensureE2eeIdentity).not.toHaveBeenCalled();
  await hook.unmount();
  getToken.mockResolvedValue(null);
  await renderHook(() => usePrivateChat('alice', null, getToken, notify)); await flush();
  expect(Socket.instances).toHaveLength(0);
});
test.each([new Error('key lost'), 'failure'])('identity failure is visible and blocks sending: %s', async error => {
  jest.mocked(ensureE2eeIdentity).mockRejectedValue(error);
  const { result } = await renderHook(() => usePrivateChat('alice', null, getToken, notify)); await flush();
  expect(result.current.e2eeReady).toBe(false);
  expect(result.current.e2eeError).toBe(error instanceof Error ? error.message : 'Verschlüsselung nicht verfügbar.');
  await act(async () => expect(await result.current.sendMessage('bob', 'hi')).toBe(false));
});
test('connects with encoded token, sends heartbeats, and cleans timers/socket on unmount', async () => {
  const { socket, result, unmount } = await start();
  expect(socket.url).toBe('ws://example.invalid/ws?access_token=a%20token');
  expect(result.current.e2eeReady).toBe(true);
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'presence.heartbeat' }));
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect(socket.send).toHaveBeenCalledTimes(2);
  await unmount(); expect(socket.close).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(socket.send).toHaveBeenCalledTimes(2);
  expect(Socket.instances).toHaveLength(1);
});
test('validates live messages, records unread once, and marks a visible conversation read', async () => {
  let visible: string | null = null;
  const hook = await renderHook(() => usePrivateChat('alice', null, getToken, notify, visible)); await flush();
  const socket = Socket.instances[0]; await act(() => socket.open());
  await act(() => { socket.receive(event()); socket.receive(event()); }); await flush();
  expect(hook.result.current.messagesByChat.bob).toHaveLength(1);
  expect(hook.result.current.unreadByChat.bob).toBe(1);
  visible = 'bob'; await hook.rerender(undefined);
  expect(hook.result.current.unreadByChat.bob).toBe(0);
  await act(() => socket.receive(event('second'))); await flush();
  expect(hook.result.current.unreadByChat.bob).toBe(0);
});
test('unreadable ciphertext is shown safely and unrelated/malformed deliveries raise a notice', async () => {
  const { socket, result } = await start();
  jest.mocked(decryptMessageForCurrentUser).mockRejectedValue(new Error('tampered'));
  await act(() => socket.receive(event())); await flush();
  expect(result.current.messagesByChat.bob[0].text).toContain('nicht lesbar');
  await act(() => { socket.receive({ ...event('bad'), ciphertext: '{}' }); socket.onmessage?.({ data: '{' }); socket.receive(null); }); await flush();
  expect(notify).toHaveBeenCalledWith('Nachricht nicht lesbar', expect.any(String));
  expect(result.current.messagesByChat.bob).toHaveLength(1);
});
test('loads paged history, merges it with live messages and never downgrades storage receipts', async () => {
  jest.mocked(getChatHistory).mockResolvedValue({ messages: [event('first')], nextCursor: 'older' });
  const { socket, result } = await start('bob');
  expect(result.current.history.bob).toEqual({ loading: false, error: null, nextCursor: 'older' });
  jest.mocked(getChatHistory).mockResolvedValue({ messages: [event('second')], nextCursor: null });
  await act(() => result.current.loadHistory('bob', 'older'));
  expect(getChatHistory).toHaveBeenLastCalledWith('a token', 'bob', 'older');
  expect(result.current.messagesByChat.bob).toHaveLength(2);
  await act(() => socket.receive(event('second'))); await flush();
  expect(result.current.messagesByChat.bob).toHaveLength(2);
});
test.each([new Error('offline'), 'unavailable'])('history errors are surfaced and can be retried: %s', async error => {
  const { result } = await start();
  jest.mocked(getChatHistory).mockRejectedValueOnce(error);
  await act(() => result.current.loadHistory('bob'));
  expect(result.current.history.bob.error).toBe(error instanceof Error ? 'offline' : 'Verlauf nicht verfügbar.');
  await act(() => result.current.loadHistory('bob'));
  expect(result.current.history.bob.error).toBeNull();
});
test.each([{ ...event(), messageId: '' }, { ...event(), senderId: 'charlie', targetId: 'dave' }])('rejects malformed or wrong-conversation history', async invalid => {
  const { result } = await start();
  jest.mocked(getChatHistory).mockResolvedValue({ messages: [invalid], nextCursor: null });
  await act(() => result.current.loadHistory('bob'));
  expect(result.current.history.bob.error).toContain('Ungültige Antwort');
  expect(result.current.messagesByChat.bob).toBeUndefined();
});
test('expired token prevents history, sending and live delivery', async () => {
  const { socket, result } = await start(); getToken.mockResolvedValue(null);
  await act(() => result.current.loadHistory('bob'));
  expect(result.current.history.bob.error).toContain('Sitzung');
  await act(async () => expect(await result.current.sendMessage('bob', 'hello')).toBe(false));
  await act(() => socket.receive(event())); await flush();
  expect(result.current.messagesByChat.bob).toBeUndefined();
  expect(notify).toHaveBeenCalledWith('Nachricht nicht gesendet', expect.stringContaining('Sitzung'));
});
test('sending encrypts content, waits for receipt, and merges a stored delivery', async () => {
  const { socket, result } = await start();
  await act(async () => expect(await result.current.sendMessage('bob', 'hello')).toBe(true));
  const outgoing = JSON.parse(socket.send.mock.calls.at(-1)![0]);
  expect(outgoing.text).toBe(ciphertext); expect(outgoing.text).not.toContain('hello');
  expect(result.current.messagesByChat.bob[0].status).toBe('sending');
  await act(() => socket.receive({ status: 'published', requestId: outgoing.requestId, messageId: 'server', timestamp: event().timestamp })); await flush();
  expect(result.current.messagesByChat.bob[0].status).toBe('published');
  await act(() => socket.receive({ ...event('server', true), ciphertext })); await flush();
  expect(result.current.messagesByChat.bob).toHaveLength(1);
  expect(result.current.messagesByChat.bob[0].status).toBe('stored');
  await act(() => socket.receive({ status: 'published', requestId: 'unknown', messageId: 'ignored', timestamp: event().timestamp })); await flush();
  expect(result.current.messagesByChat.bob).toHaveLength(1);
});
test('unacknowledged sends time out and broker errors never become success', async () => {
  const { socket, result } = await start();
  await act(() => result.current.sendMessage('bob', 'first'));
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(result.current.messagesByChat.bob[0].status).toBe('unconfirmed');
  await act(() => result.current.sendMessage('bob', 'second'));
  const requestId = JSON.parse(socket.send.mock.calls.at(-1)![0]).requestId;
  await act(() => socket.receive({ status: 'error', requestId })); await flush();
  expect(result.current.messagesByChat.bob.every(message => message.status === 'unconfirmed')).toBe(true);
  expect(notify).toHaveBeenCalledWith('Versand nicht bestätigt', 'Bitte die Verbindung prüfen.');
  await act(() => socket.receive({ status: 'error', requestId, message: 'broker offline' })); await flush();
  expect(notify).toHaveBeenLastCalledWith('Versand nicht bestätigt', 'broker offline');
});
test.each([new Error('cannot encrypt'), 'failure'])('encryption failures retain a clean sending state: %s', async error => {
  const { result } = await start();
  jest.mocked(encryptMessageForUser).mockRejectedValue(error);
  await act(async () => expect(await result.current.sendMessage('bob', 'hello')).toBe(false));
  expect(result.current.isSendingMessage).toBe(false);
  expect(result.current.messagesByChat.bob).toBeUndefined();
});
test('empty and oversized text are rejected without encryption', async () => {
  const { result } = await start();
  await act(async () => { expect(await result.current.sendMessage('bob', ' ')).toBe(false); expect(await result.current.sendMessage('bob', 'x'.repeat(4001))).toBe(false); });
  expect(encryptMessageForUser).not.toHaveBeenCalled();
});
test('disconnect marks pending messages unconfirmed and reconnects without resending them', async () => {
  const { socket, result } = await start(); await act(() => result.current.sendMessage('bob', 'hello'));
  await act(() => { socket.onerror?.(); socket.disconnect(); });
  expect(result.current.connectionError).toContain('unterbrochen');
  expect(result.current.messagesByChat.bob[0].status).toBe('unconfirmed');
  await act(async () => { jest.advanceTimersByTime(2000); }); await flush();
  expect(Socket.instances).toHaveLength(2);
  expect(Socket.instances[1].send).not.toHaveBeenCalled();
  await act(() => Socket.instances[1].open());
  expect(result.current.connectionError).toBeNull();
});
test('replacement-tab close does not retry', async () => {
  const { socket, result } = await start(); await act(() => socket.disconnect(4001));
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(Socket.instances).toHaveLength(1);
  expect(result.current.connectionError).toContain('andere Anmeldung');
});
test('connection failures schedule retry, and a missing connection token avoids opening a socket', async () => {
  getToken.mockResolvedValueOnce('token').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null);
  const { result } = await renderHook(() => usePrivateChat('alice', null, getToken, notify)); await flush();
  expect(result.current.connectionError).toContain('nicht erreichbar');
  await act(async () => { jest.advanceTimersByTime(2000); }); await flush();
  expect(Socket.instances).toHaveLength(0);
});
test('a late history response cannot populate another account', async () => {
  let user = 'alice';
  const hook = await renderHook(() => usePrivateChat(user, null, getToken, notify)); await flush();
  let resolve!: (page: { messages: ChatEvent[]; nextCursor: null }) => void;
  jest.mocked(getChatHistory).mockReturnValue(new Promise(r => { resolve = r; }));
  let pending!: Promise<void>;
  await act(() => { pending = hook.result.current.loadHistory('bob'); });
  user = 'charlie'; await hook.rerender(undefined); await flush();
  await act(async () => { resolve({ messages: [event()], nextCursor: null }); await pending; });
  expect(hook.result.current.messagesByChat).toEqual({});
});
