import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/auth/auth-context';
import { ApiError, login, logout, refreshAuthSession } from '../../src/utils/api-client';
import { clearStoredSession, loadStoredSession, saveStoredSession } from '../../src/auth/session-storage';

jest.mock('../../src/utils/api-client', () => ({ ...jest.requireActual('../../src/utils/api-client'), login: jest.fn(), logout: jest.fn(), refreshAuthSession: jest.fn() }));
jest.mock('../../src/auth/session-storage', () => ({ loadStoredSession: jest.fn(), saveStoredSession: jest.fn(), clearStoredSession: jest.fn() }));
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const session = { accessToken: 'access', refreshToken: 'refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { userId: 'alice', email: 'alice@example.invalid' } };
const mockLoad = jest.mocked(loadStoredSession);
const mockRefresh = jest.mocked(refreshAuthSession);
beforeEach(() => {
  jest.clearAllMocks();
  for (const mock of [mockLoad, mockRefresh, jest.mocked(login), jest.mocked(logout)]) mock.mockReset();
  mockLoad.mockResolvedValue(null);
  jest.mocked(saveStoredSession).mockResolvedValue();
  jest.mocked(clearStoredSession).mockResolvedValue();
});

test('rejects useAuth outside a provider with a useful error', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(renderHook(() => useAuth())).rejects.toThrow('AuthProvider');
});
test('anonymous token and logout do not call the API', async () => {
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(await result.current.getValidAccessToken()).toBeNull();
  await act(() => result.current.signOut());
  expect(logout).not.toHaveBeenCalled();
});
test('restores a fresh session, returns its token and consumes login feedback', async () => {
  mockLoad.mockResolvedValue(session);
  jest.mocked(login).mockResolvedValue(session);
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(await result.current.getValidAccessToken()).toBe('access');
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(() => result.current.signIn('alice@example.invalid', 'password'));
  expect(result.current.loginSuccessPending).toBe(true);
  await act(() => result.current.consumeLoginSuccess());
  expect(result.current.loginSuccessPending).toBe(false);
});
test('refreshes an expired restored session and saves rotated tokens once', async () => {
  mockLoad.mockResolvedValue({ ...session, expiresAt: 1 });
  mockRefresh.mockResolvedValue({ ...session, accessToken: 'rotated' });
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(await result.current.getValidAccessToken()).toBe('rotated');
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(saveStoredSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'rotated' }));
});
test.each([new ApiError('expired', 401), new Error('offline')])('clears an expired restored session when refresh fails: %s', async error => {
  mockLoad.mockResolvedValue({ ...session, expiresAt: 1 });
  mockRefresh.mockRejectedValue(error);
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.session).toBeNull();
  expect(clearStoredSession).toHaveBeenCalled();
});
test('concurrent token requests share a refresh and an unauthorized refresh clears the session', async () => {
  mockLoad.mockResolvedValue(session);
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  jest.spyOn(Date, 'now').mockReturnValue((session.expiresAt - 30) * 1000);
  let resolve!: (value: typeof session) => void;
  mockRefresh.mockReturnValue(new Promise(r => { resolve = r; }));
  let tokens!: (string | null)[];
  await act(async () => {
    const a = result.current.getValidAccessToken();
    const b = result.current.getValidAccessToken();
    resolve({ ...session, accessToken: 'new', expiresAt: session.expiresAt + 3600 });
    tokens = await Promise.all([a, b]);
  });
  expect(tokens).toEqual(['new', 'new']);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  jest.spyOn(Date, 'now').mockReturnValue((session.expiresAt + 3600) * 1000);
  mockRefresh.mockRejectedValue(new ApiError('expired', 401));
  await act(async () => expect(await result.current.getValidAccessToken()).toBeNull());
  expect(result.current.session).toBeNull();
});
test('transient refresh failure propagates and permits retry without deleting a fresh session', async () => {
  mockLoad.mockResolvedValue(session);
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  jest.spyOn(Date, 'now').mockReturnValue(session.expiresAt * 1000);
  mockRefresh.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...session, expiresAt: session.expiresAt + 3600 });
  await act(async () => expect(result.current.getValidAccessToken()).rejects.toThrow('offline'));
  expect(result.current.session).toEqual(session);
  await act(async () => expect(await result.current.getValidAccessToken()).toBe('access'));
});
test('failed server logout still clears local session', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockLoad.mockResolvedValue(session);
  jest.mocked(logout).mockRejectedValue(new Error('offline'));
  const { result } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(() => result.current.signOut());
  expect(result.current.session).toBeNull();
  expect(clearStoredSession).toHaveBeenCalledTimes(1);
});
test('foreground checks and periodic checks refresh tokens; failures are reported', async () => {
  let change!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => { change = callback; return { remove }; });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockLoad.mockResolvedValue(session);
  const { result, unmount } = await renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(session.expiresAt * 1000);
  mockRefresh.mockRejectedValue(new Error('offline'));
  await act(async () => { change('background'); change('active'); await Promise.resolve(); });
  expect(warn).toHaveBeenCalled();
  await unmount();
  expect(remove).toHaveBeenCalled();
  jest.useRealTimers();
});
test('does not restore a late session after unmount', async () => {
  let resolve!: (value: typeof session) => void;
  mockLoad.mockReturnValue(new Promise(r => { resolve = r; }));
  const { unmount } = await renderHook(useAuth, { wrapper });
  await unmount();
  await act(async () => { resolve(session); });
  expect(saveStoredSession).not.toHaveBeenCalled();
});
