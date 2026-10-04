import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignInScreen from '../../src/app/sign-in';
import { useAuth } from '../../src/auth/auth-context';
import { router } from 'expo-router';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('../../src/auth/auth-context', () => ({
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

    it('navigates to registration and handles unknown login failures', async () => {
        mockSignIn.mockRejectedValueOnce('failure');
        const ui = await render(<SignInScreen />);
        await fireEvent.press(ui.getByText('Registrieren'));
        expect(router.push).toHaveBeenCalledWith('/register');
        await fireEvent.changeText(ui.getByPlaceholderText('email@beispiel.de'), 'mail@example.invalid');
        await fireEvent.press(ui.getByText('Anmelden'));
        expect(mockSignIn).not.toHaveBeenCalled();
        await fireEvent.changeText(ui.getByPlaceholderText('••••••••'), 'password');
        await fireEvent.press(ui.getByText('Anmelden'));
        expect(ui.getByText('Die Anmeldung ist fehlgeschlagen.')).toBeTruthy();
    });

    it('zeigt einen Fehler an, wenn E-Mail oder Passwort leer sind', async () => {
        const { getByText } = await render(<SignInScreen />);

        await act(async () => {
            await fireEvent.press(getByText('Anmelden'));
        });

        await waitFor(() => {
            expect(getByText('Bitte gib deine E-Mail-Adresse und dein Passwort ein.')).toBeTruthy();
        });

        expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('ruft signIn mit getrimmter und kleingeschriebener E-Mail auf', async () => {
        const { getByText, getByPlaceholderText } = await render(<SignInScreen />);

        await act(async () => {
            await fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), ' Test@Mail.de ');
            await fireEvent.changeText(getByPlaceholderText('••••••••'), 'geheim123');
        });

        await act(async () => {
            await fireEvent.press(getByText('Anmelden'));
        });

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalledWith('test@mail.de', 'geheim123');
        });
    });

    it('zeigt eine Fehlermeldung an, wenn der Login fehlschlägt', async () => {
        mockSignIn.mockRejectedValueOnce(new Error('Falsches Passwort'));
        const { getByText, getByPlaceholderText } = await render(<SignInScreen />);

        await act(async () => {
            await fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), 'test@mail.de');
            await fireEvent.changeText(getByPlaceholderText('••••••••'), 'falsch');
        });

        await act(async () => {
            await fireEvent.press(getByText('Anmelden'));
        });

        await waitFor(() => {
            expect(getByText('Falsches Passwort')).toBeTruthy();
        });
    });
});
