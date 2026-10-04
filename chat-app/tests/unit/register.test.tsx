import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import RegisterScreen from '../../src/app/register';
import { registerAccount } from '../../src/utils/api-client';
import { router } from 'expo-router';
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

jest.mock('../../src/utils/api-client', () => ({
    registerAccount: jest.fn(),
}));

describe('RegisterScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects empty fields and returns to sign-in', async () => {
        const ui = await render(<RegisterScreen />);
        const submit = () => ui.getAllByText('Konto erstellen').at(-1)!;
        await fireEvent.press(submit()); expect(ui.getByText('Bitte fülle alle Felder aus.')).toBeTruthy();
        await fireEvent.changeText(ui.getByPlaceholderText('email@beispiel.de'), 'mail@example.invalid');
        await fireEvent.press(submit());
        await fireEvent.changeText(ui.getAllByPlaceholderText('••••••••')[0], 'password');
        await fireEvent.press(submit()); expect(registerAccount).not.toHaveBeenCalled();
        await fireEvent.press(ui.getByText('Zur Anmeldung')); expect(router.replace).toHaveBeenCalledWith('/sign-in');
    });

    it.each([new Error('already registered'), 'failure'])('shows registration failures without clearing the inputs: %s', async error => {
        jest.mocked(registerAccount).mockRejectedValueOnce(error);
        const ui = await render(<RegisterScreen />);
        await fireEvent.changeText(ui.getByPlaceholderText('email@beispiel.de'), 'mail@example.invalid');
        for (const input of ui.getAllByPlaceholderText('••••••••')) await fireEvent.changeText(input, 'password');
        await fireEvent.press(ui.getAllByText('Konto erstellen').at(-1)!);
        expect(ui.getByText(error instanceof Error ? error.message : 'Die Registrierung ist fehlgeschlagen.')).toBeTruthy();
        expect(ui.getAllByPlaceholderText('••••••••')[0].props.value).toBe('password');
    });

    it('verhindert Registrierung, wenn Passwörter nicht übereinstimmen', async () => {
        const { getByText, getAllByText, getAllByPlaceholderText, getByPlaceholderText } = await render(<RegisterScreen />);

        await act(async () => {
            await fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), 'test@mail.de');
        });

        const passwordInputs = getAllByPlaceholderText('••••••••');

        await act(async () => {
            await fireEvent.changeText(passwordInputs[0], 'passwort123');
            await fireEvent.changeText(passwordInputs[1], 'passwort456');
        });

        const submitButtons = getAllByText('Konto erstellen');

        await act(async () => {
            await fireEvent.press(submitButtons[submitButtons.length - 1]);
        });

        await waitFor(() => {
            expect(getByText('Die Passwörter stimmen nicht überein.')).toBeTruthy();
        });

        expect(registerAccount).not.toHaveBeenCalled();
    });

    it('führt erfolgreiche Registrierung durch und zeigt Erfolgsmeldung', async () => {
        (registerAccount as jest.Mock).mockResolvedValueOnce({
            message: 'Konto erfolgreich erstellt',
            requiresEmailConfirmation: false,
        });

        const { getByText, getAllByText, getAllByPlaceholderText, getByPlaceholderText } = await render(<RegisterScreen />);

        await act(async () => {
            await fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), 'neu@mail.de');
        });

        const passwordInputs = getAllByPlaceholderText('••••••••');

        await act(async () => {
            await fireEvent.changeText(passwordInputs[0], 'passwort123');
            await fireEvent.changeText(passwordInputs[1], 'passwort123');
        });

        const submitButtons = getAllByText('Konto erstellen');

        await act(async () => {
            await fireEvent.press(submitButtons[submitButtons.length - 1]);
        });

        await waitFor(() => {
            expect(registerAccount).toHaveBeenCalledWith('neu@mail.de', 'passwort123');
            expect(getByText('Konto erfolgreich erstellt')).toBeTruthy();
        });
    });
});
