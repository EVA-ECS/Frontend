// Robin's workspace cases adapted to the current private-chat hook and async renderer.
import React from 'react';
import * as Native from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ChatWorkspace from '../../src/components/chat-workspace';
import { useAuth } from '../../src/auth/auth-context';
import { getUsers } from '../../src/utils/api-client';
import { usePrivateChat } from '../../src/chat/use-private-chat';
import { useAppActive } from '../../src/chat/use-app-active';
import type { ChatMessage } from '../../src/chat/messages';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../src/auth/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../src/utils/api-client', () => ({ getUsers: jest.fn() }));
jest.mock('../../src/chat/use-private-chat', () => ({ usePrivateChat: jest.fn() }));
jest.mock('../../src/chat/use-app-active', () => ({ useAppActive: jest.fn() }));
const token = jest.fn(); const signOut = jest.fn(); const consume = jest.fn();
let auth: ReturnType<typeof useAuth>;
let chat: ReturnType<typeof usePrivateChat>;
const users = [{ userId: 'bob', displayName: 'Bob', isOnline: true }, { userId: 'carol', displayName: 'Carol', isOnline: false }];
const send = jest.fn(); const load = jest.fn();
async function flush() { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); }
async function screen() { const result = await render(<ChatWorkspace />); await flush(); return result; }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  token.mockReset().mockResolvedValue('token'); signOut.mockReset().mockResolvedValue(undefined); send.mockReset().mockResolvedValue(true);
  jest.mocked(getUsers).mockReset().mockResolvedValue(users);
  Object.defineProperty(Native.Platform, 'OS', { value: 'web', writable: true, configurable: true });
  jest.mocked(Native.useWindowDimensions).mockReturnValue({ width: 1000, height: 800, scale: 1, fontScale: 1 });
  auth = { session: { accessToken: 'token', refreshToken: 'refresh', expiresAt: 9999999999, user: { userId: 'alice', email: 'alice@example.invalid' } }, isLoading: false, loginSuccessPending: false, consumeLoginSuccess: consume, getValidAccessToken: token, signIn: jest.fn(), signOut };
  chat = { messagesByChat: {}, unreadByChat: {}, history: {}, loadHistory: load, sendMessage: send, isSendingMessage: false, e2eeError: null, connectionError: null, e2eeReady: true };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(usePrivateChat).mockImplementation(() => chat);
  jest.mocked(useAppActive).mockReturnValue(true);
});
afterEach(() => jest.useRealTimers());
test('loads users and shows account, online/offline states and accessible chat selection', async () => {
  const ui = await screen();
  expect(getUsers).toHaveBeenCalledWith('token'); expect(ui.getByText('alice@example.invalid')).toBeTruthy();
  expect(ui.getByLabelText('Chat mit Bob')).toBeTruthy(); expect(ui.getByText('Offline')).toBeTruthy();
  await fireEvent.press(ui.getByLabelText('Chat mit Carol'));
  expect(usePrivateChat).toHaveBeenLastCalledWith('alice', 'carol', token, expect.any(Function), 'carol');
});
test('sends trimmed text and clears only the successfully sent draft', async () => {
  const ui = await screen(); await fireEvent.changeText(ui.getByLabelText('Nachricht'), ' hello ');
  await fireEvent.press(ui.getByLabelText('Nachricht senden')); await flush();
  expect(send).toHaveBeenCalledWith('bob', 'hello'); expect(ui.getByLabelText('Nachricht').props.value).toBe('');
});
test('retains a failed draft and prevents empty, repeated, busy and unready sends', async () => {
  send.mockResolvedValue(false); const ui = await screen();
  await fireEvent.press(ui.getByLabelText('Nachricht senden')); expect(send).not.toHaveBeenCalled();
  await fireEvent.changeText(ui.getByLabelText('Nachricht'), 'hello');
  await fireEvent.press(ui.getByLabelText('Nachricht senden')); expect(ui.getByLabelText('Nachricht').props.value).toBe('hello');
  chat = { ...chat, isSendingMessage: true }; await ui.rerender(<ChatWorkspace />);
  await fireEvent.press(ui.getByLabelText('Nachricht senden')); expect(send).toHaveBeenCalledTimes(1);
  chat = { ...chat, isSendingMessage: false, e2eeReady: false, e2eeError: 'lost key' }; await ui.rerender(<ChatWorkspace />);
  await fireEvent.press(ui.getByLabelText('Nachricht senden')); expect(send).toHaveBeenCalledTimes(1);
  expect(ui.getByText('E2EE-Fehler: lost key')).toBeTruthy();
});
test('preserves newly typed text while a send is pending and blocks concurrent sends', async () => {
  let resolve!: (sent: boolean) => void; send.mockReturnValue(new Promise(r => { resolve = r; }));
  const ui = await screen(); await fireEvent.changeText(ui.getByLabelText('Nachricht'), 'first');
  await fireEvent.press(ui.getByLabelText('Nachricht senden'));
  await fireEvent.press(ui.getByLabelText('Nachricht senden'));
  await fireEvent.changeText(ui.getByLabelText('Nachricht'), 'next');
  await act(async () => { resolve(true); });
  expect(send).toHaveBeenCalledTimes(1); expect(ui.getByLabelText('Nachricht').props.value).toBe('next');
});
test('web Enter sends once while composition, Shift and repeat keep the draft', async () => {
  const ui = await screen(); const input = ui.getByLabelText('Nachricht');
  await fireEvent.changeText(input, 'hello');
  for (const nativeEvent of [{ key: 'a' }, { key: 'Enter', shiftKey: true }, { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'Enter', repeat: true }]) {
    await fireEvent(input, 'keyPress', { nativeEvent, preventDefault: jest.fn() });
  }
  expect(send).not.toHaveBeenCalled(); const preventDefault = jest.fn();
  await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter' }, preventDefault }); await flush();
  expect(send).toHaveBeenCalledTimes(1); expect(preventDefault).toHaveBeenCalled();
  Object.defineProperty(Native.Platform, 'OS', { value: 'ios', writable: true, configurable: true });
  await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter' }, preventDefault }); expect(send).toHaveBeenCalledTimes(1);
});
test('compact layout switches between list and conversation with accurate visibility', async () => {
  jest.mocked(Native.useWindowDimensions).mockReturnValue({ width: 400, height: 800, scale: 1, fontScale: 1 });
  const ui = await screen(); expect(ui.queryByLabelText('Nachricht')).toBeNull();
  expect(usePrivateChat).toHaveBeenLastCalledWith('alice', 'bob', token, expect.any(Function), null);
  await fireEvent.press(ui.getByLabelText('Chat mit Bob')); expect(ui.getByLabelText('Nachricht')).toBeTruthy();
  await fireEvent.press(ui.getByLabelText('Zur Chatliste')); expect(ui.queryByLabelText('Nachricht')).toBeNull();
  jest.mocked(useAppActive).mockReturnValue(false); await ui.rerender(<ChatWorkspace />);
  expect(usePrivateChat).toHaveBeenLastCalledWith('alice', 'bob', token, expect.any(Function), null);
});
test('displays unread badges and each publication state without claiming storage too early', async () => {
  chat.unreadByChat = { bob: 1, carol: 101 };
  chat.messagesByChat.bob = ['sending', 'published', 'stored', 'unconfirmed'].map((status, index) => ({ id: String(index), requestId: String(index), mine: true, text: `text-${index}`, time: '12:00', timestamp: '2026-09-18T12:00:00Z', ciphertext: String(index), status } as ChatMessage));
  chat.messagesByChat.bob.push({ ...chat.messagesByChat.bob[0], id: 'received', requestId: undefined, mine: false, text: 'received' });
  const ui = await screen(); expect(ui.getByLabelText('1 ungelesene Nachricht')).toBeTruthy(); expect(ui.getByText('99+')).toBeTruthy();
  for (const label of ['Wird gesendet …', 'An Warteschlange übergeben', 'Gespeichert', 'Versand nicht bestätigt', 'received']) expect(ui.getByText(label)).toBeTruthy();
});
test('supports history retry, pagination and scroll events', async () => {
  chat.history.bob = { loading: false, error: 'history offline', nextCursor: 'older' };
  const ui = await screen();
  await fireEvent.press(ui.getByLabelText('Verlauf erneut laden')); expect(load).toHaveBeenCalledWith('bob');
  await fireEvent.press(ui.getByLabelText('Ältere Nachrichten laden')); expect(load).toHaveBeenCalledWith('bob', 'older');
  const historyView = ui.container.queryAll(node => node.props.scrollEventThrottle === 16 && typeof node.props.onScroll === 'function')[0];
  await fireEvent(historyView, 'scroll', { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 400 } } });
  await fireEvent(historyView, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } });
  await fireEvent(historyView, 'contentSizeChange', 400, 1000);
  await fireEvent(historyView, 'scroll', { nativeEvent: { contentOffset: { y: 600 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 400 } } });
  await fireEvent(historyView, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } });
  await fireEvent(historyView, 'contentSizeChange', 400, 1000);
});
test('shows connection and key-preparation information while history is loading', async () => {
  chat.e2eeReady = false; chat.connectionError = 'reconnecting'; chat.history.bob = { loading: true, error: null, nextCursor: 'older' };
  const ui = await screen(); expect(ui.getByText('reconnecting')).toBeTruthy(); expect(ui.getByText('E2EE-Schlüssel wird vorbereitet …')).toBeTruthy();
});
test('login success feedback is consumed once and disappears', async () => {
  auth.loginSuccessPending = true; const ui = await screen();
  await act(async () => { jest.advanceTimersByTime(1); }); expect(ui.getByText('Anmeldung erfolgreich')).toBeTruthy(); expect(consume).toHaveBeenCalledTimes(1);
  auth.loginSuccessPending = false; await ui.rerender(<ChatWorkspace />);
  await act(async () => { jest.advanceTimersByTime(5000); }); expect(ui.queryByText('Anmeldung erfolgreich')).toBeNull();
});
test.each([new Error('directory offline'), 'bad response'])('reports directory failure and recovers on refresh: %s', async error => {
  jest.mocked(getUsers).mockRejectedValueOnce(error).mockResolvedValue(users);
  const ui = await screen(); expect(ui.getByText('Serverfehler')).toBeTruthy();
  expect(ui.getByText(error instanceof Error ? 'directory offline' : 'Nutzer konnten nicht geladen werden.')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(30000); }); await flush();
  expect(ui.getByLabelText('Chat mit Bob')).toBeTruthy();
});
test('an empty directory stays empty and an expired token skips HTTP', async () => {
  jest.mocked(getUsers).mockResolvedValue([]); const ui = await screen(); expect(ui.getByText('Noch keine anderen Nutzer gefunden.')).toBeTruthy();
  token.mockResolvedValue(null); await act(async () => { jest.advanceTimersByTime(30000); }); await flush(); expect(getUsers).toHaveBeenCalledTimes(1);
});
test('refresh preserves selection while present, and chooses a remaining contact when removed', async () => {
  const ui = await screen(); await fireEvent.press(ui.getByLabelText('Chat mit Carol'));
  await act(async () => { jest.advanceTimersByTime(30000); }); await flush();
  expect(usePrivateChat).toHaveBeenLastCalledWith('alice', 'carol', token, expect.any(Function), 'carol');
  jest.mocked(getUsers).mockResolvedValue([users[0]]); await act(async () => { jest.advanceTimersByTime(30000); }); await flush();
  expect(usePrivateChat).toHaveBeenLastCalledWith('alice', 'bob', token, expect.any(Function), 'bob');
});
test('slow directory requests are not duplicated and late results are ignored after unmount', async () => {
  let resolve!: (list: typeof users) => void; jest.mocked(getUsers).mockReturnValue(new Promise(r => { resolve = r; }));
  const ui = await screen(); await act(async () => { jest.advanceTimersByTime(60000); }); expect(getUsers).toHaveBeenCalledTimes(1);
  await ui.unmount(); await act(async () => { resolve(users); }); expect(getUsers).toHaveBeenCalledTimes(1);
});
test('anonymous workspace never requests a directory', async () => {
  auth.session = null; const ui = await screen(); expect(getUsers).not.toHaveBeenCalled(); expect(ui.queryByLabelText('Nachricht')).toBeNull();
});
test('logout calls the context and errors allow a second attempt', async () => {
  signOut.mockRejectedValueOnce(new Error('logout offline')); const ui = await screen();
  await fireEvent.press(ui.getByLabelText('Abmelden')); await flush(); expect(ui.getByText('logout offline')).toBeTruthy();
  await fireEvent.press(ui.getByLabelText('Abmelden')); await flush(); expect(signOut).toHaveBeenCalledTimes(2);
});
test('non-Error logout failure shows fallback feedback', async () => {
  signOut.mockRejectedValue('failed'); const ui = await screen(); await fireEvent.press(ui.getByLabelText('Abmelden')); await flush(); expect(ui.getByText('Die Abmeldung ist fehlgeschlagen.')).toBeTruthy();
});
