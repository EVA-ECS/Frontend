import React from 'react';
import { renderHook, act, waitFor, render } from '@testing-library/react-native'; import { AuthProvider, useAuth } from '../auth/auth-context';
import { login, logout, refreshAuthSession } from '../utils/api-client';
import { loadStoredSession, saveStoredSession, clearStoredSession } from '../auth/session-storage';

jest.mock('../utils/api-client', () => ({
    login: jest.fn(),
    logout: jest.fn(),
    refreshAuthSession: jest.fn(),
    ApiError: class extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.status = status;
        }
    },
}));

jest.mock('../auth/session-storage', () => ({
    loadStoredSession: jest.fn(),
    saveStoredSession: jest.fn(),
    clearStoredSession: jest.fn(),
}));

describe('AuthContext', () => {
    const mockSession = {
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        user: { userId: '1', email: 'test@mail.de' },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (loadStoredSession as jest.Mock).mockResolvedValue(null);
    });

    it('stellt sicher, dass useAuth außerhalb des Providers fehlschlägt', () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });

        let error: unknown;
        try {
            useAuth();
        } catch (e) {
            error = e;
        }

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeDefined();

        consoleError.mockRestore();
    });

    it('stellt erfolgreichen Login und Session-Speicherung bereit', async () => {
        (login as jest.Mock).mockResolvedValueOnce(mockSession);

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );

        const { result } = await renderHook(() => useAuth(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.signIn('test@mail.de', 'password');
        });

        expect(login).toHaveBeenCalledWith('test@mail.de', 'password');
        expect(saveStoredSession).toHaveBeenCalledWith(mockSession);
        expect(result.current.session).toEqual(mockSession);
        expect(result.current.loginSuccessPending).toBe(true);
    });

    it('führt Logout durch und räumt Session ab', async () => {
        (loadStoredSession as jest.Mock).mockResolvedValue(mockSession);
        (logout as jest.Mock).mockResolvedValueOnce(undefined);

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );

        const { result } = await renderHook(() => useAuth(), { wrapper });

        await waitFor(() => expect(result.current.session).toEqual(mockSession));

        await act(async () => {
            await result.current.signOut();
        });

        expect(logout).toHaveBeenCalledWith('valid-token');
        expect(clearStoredSession).toHaveBeenCalled();
        expect(result.current.session).toBeNull();
    });
});