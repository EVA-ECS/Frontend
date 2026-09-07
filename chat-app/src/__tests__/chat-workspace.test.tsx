import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ChatWorkspace from '../components/chat-workspace';
import { useAuth } from '../auth/auth-context';
import { getUsers } from '../utils/api-client';

jest.mock('../auth/auth-context', () => ({
    useAuth: jest.fn(),
}));

jest.mock('../utils/api-client', () => ({
    getUsers: jest.fn(),
    GATEWAY_WS_URL: 'ws://localhost',
}));

class MockWebSocket {
    readyState = WebSocket.OPEN;
    send = jest.fn();
    close = jest.fn();
    onopen: (() => void) | null = null;
    onmessage: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor() {
        setTimeout(() => this.onopen?.(), 10);
    }
}

(global as any).WebSocket = MockWebSocket;

describe('ChatWorkspace', () => {
    const mockSignOut = jest.fn();
    const mockGetValidAccessToken = jest.fn().mockResolvedValue('token123');

    beforeEach(() => {
        jest.clearAllMocks();
        (useAuth as jest.Mock).mockReturnValue({
            session: { user: { userId: 'me', email: 'me@mail.de' }, accessToken: 'token123' },
            signOut: mockSignOut,
            getValidAccessToken: mockGetValidAccessToken,
            loginSuccessPending: false,
            consumeLoginSuccess: jest.fn(),
        });
    });

    it('lädt und zeigt die Nutzerliste im Chat an', async () => {
        (getUsers as jest.Mock).mockResolvedValueOnce([
            { userId: 'user-2', displayName: 'Maximilian', isOnline: true },
        ]);

        const { getByText } = await render(<ChatWorkspace />);

        await waitFor(() => {
            expect(getByText('Maximilian')).toBeTruthy();
            expect(getByText('Online')).toBeTruthy();
        });
    });

    it('ermöglicht das Tippen und Senden einer Nachricht via WebSocket', async () => {
        (getUsers as jest.Mock).mockResolvedValueOnce([
            { userId: 'user-2', displayName: 'Maximilian', isOnline: true },
        ]);

        const { getByLabelText, getByText } = await render(<ChatWorkspace />);

        await waitFor(() => {
            expect(getByText('Maximilian')).toBeTruthy();
        });

        await act(async () => {
            fireEvent.press(getByText('Maximilian'));
        });

        const input = await waitFor(() => getByLabelText('Nachricht'));

        await act(async () => {
            fireEvent.changeText(input, 'Hallo Welt!');
        });

        const sendButton = getByText('➤');

        await act(async () => {
            fireEvent.press(sendButton);
        });

        await waitFor(() => {
            expect(getByText('Hallo Welt!')).toBeTruthy();
        });
    });
});