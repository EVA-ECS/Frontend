import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { loadStoredSession, saveStoredSession, clearStoredSession } from '../auth/session-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

describe('Session Storage', () => {
    const mockSession = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        user: { userId: '123', email: 'test@mail.de' },
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lädt Session über AsyncStorage im Web', async () => {
        (Platform as any).OS = 'web';
        (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockSession));

        const result = await loadStoredSession();
        expect(AsyncStorage.getItem).toHaveBeenCalledWith('eva.auth.session');
        expect(result).toEqual(mockSession);
    });

    it('lädt Session über SecureStore auf Native', async () => {
        (Platform as any).OS = 'ios';
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockSession));

        const result = await loadStoredSession();
        expect(SecureStore.getItemAsync).toHaveBeenCalledWith('eva.auth.session');
        expect(result).toEqual(mockSession);
    });

    it('löscht ungültige oder beschädigte Session-Daten', async () => {
        (Platform as any).OS = 'ios';
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('invalid-json');

        const result = await loadStoredSession();
        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('eva.auth.session');
    });

    it('speichert Session korrekt ab', async () => {
        (Platform as any).OS = 'ios';
        await saveStoredSession(mockSession);

        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            'eva.auth.session',
            JSON.stringify(mockSession),
            expect.any(Object)
        );
    });

    it('loescht Session korrekt', async () => {
        (Platform as any).OS = 'ios';
        await clearStoredSession();

        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('eva.auth.session');
    });
});