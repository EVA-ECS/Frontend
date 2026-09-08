import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignInScreen from '../app/sign-in';
import { useAuth } from '../auth/auth-context';

jest.mock('../auth/auth-context', () => ({
    useAuth: jest.fn(),
}));

describe('SignInScreen', () => {
    const mockSignIn = jest.fn();

    beforeEach(() => {
        (useAuth as jest.Mock).mockReturnValue({
            signIn: mockSignIn,
        });
        jest.clearAllMocks();
    });

    it('zeigt einen Fehler an, wenn E-Mail oder Passwort leer sind', async () => {
        const { getByText } = await render(<SignInScreen />);

        await act(async () => {
            fireEvent.press(getByText('Anmelden'));
        });

        await waitFor(() => {
            expect(getByText('Bitte gib deine E-Mail-Adresse und dein Passwort ein.')).toBeTruthy();
        });

        expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('ruft signIn mit getrimmter und kleingeschriebener E-Mail auf', async () => {
        const { getByText, getByPlaceholderText } = await render(<SignInScreen />);

        await act(async () => {
            fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), ' Test@Mail.de ');
            fireEvent.changeText(getByPlaceholderText('••••••••'), 'geheim123');
        });

        await act(async () => {
            fireEvent.press(getByText('Anmelden'));
        });

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalledWith('test@mail.de', 'geheim123');
        });
    });

    it('zeigt eine Fehlermeldung an, wenn der Login fehlschlägt', async () => {
        mockSignIn.mockRejectedValueOnce(new Error('Falsches Passwort'));
        const { getByText, getByPlaceholderText } = await render(<SignInScreen />);

        await act(async () => {
            fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), 'test@mail.de');
            fireEvent.changeText(getByPlaceholderText('••••••••'), 'falsch');
        });

        await act(async () => {
            fireEvent.press(getByText('Anmelden'));
        });

        await waitFor(() => {
            expect(getByText('Falsches Passwort')).toBeTruthy();
        });
    });
});