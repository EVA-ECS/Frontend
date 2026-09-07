import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import RegisterScreen from '../app/register';
import { registerAccount } from '../utils/api-client';

jest.mock('../utils/api-client', () => ({
    registerAccount: jest.fn(),
}));

describe('RegisterScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('verhindert Registrierung, wenn Passwörter nicht übereinstimmen', async () => {
        const { getByText, getAllByText, getAllByPlaceholderText, getByPlaceholderText } = await render(<RegisterScreen />);

        await act(async () => {
            fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), 'test@mail.de');
        });

        const passwordInputs = getAllByPlaceholderText('••••••••');

        await act(async () => {
            fireEvent.changeText(passwordInputs[0], 'passwort123');
            fireEvent.changeText(passwordInputs[1], 'passwort456');
        });

        const submitButtons = getAllByText('Konto erstellen');

        await act(async () => {
            fireEvent.press(submitButtons[submitButtons.length - 1]);
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
            fireEvent.changeText(getByPlaceholderText('email@beispiel.de'), 'neu@mail.de');
        });

        const passwordInputs = getAllByPlaceholderText('••••••••');

        await act(async () => {
            fireEvent.changeText(passwordInputs[0], 'passwort123');
            fireEvent.changeText(passwordInputs[1], 'passwort123');
        });

        const submitButtons = getAllByText('Konto erstellen');

        await act(async () => {
            fireEvent.press(submitButtons[submitButtons.length - 1]);
        });

        await waitFor(() => {
            expect(registerAccount).toHaveBeenCalledWith('neu@mail.de', 'passwort123');
            expect(getByText('Konto erfolgreich erstellt')).toBeTruthy();
        });
    });
});