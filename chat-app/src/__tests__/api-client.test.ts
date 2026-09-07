import { login, registerAccount, getUsers, ApiError, GATEWAY_HTTP_URL } from '../utils/api-client';

global.fetch = jest.fn();

describe('API Client', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('login sendet korrekten POST-Request und gibt Session zurück', async () => {
        const mockSession = { accessToken: 'token123', user: { userId: '1', email: 'test@mail.de' } };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockSession,
        });

        const result = await login('test@mail.de', 'password123');

        expect(global.fetch).toHaveBeenCalledWith(`${GATEWAY_HTTP_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@mail.de', password: 'password123' }),
        });
        expect(result).toEqual(mockSession);
    });

    it('registerAccount sendet korrekten Request für die Registrierung', async () => {
        const mockResponse = { message: 'Konto erstellt', requiresEmailConfirmation: false };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockResponse,
        });

        const result = await registerAccount('neu@mail.de', 'geheim123');

        expect(global.fetch).toHaveBeenCalledWith(`${GATEWAY_HTTP_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'neu@mail.de', password: 'geheim123' }),
        });
        expect(result).toEqual(mockResponse);
    });

    it('wirft einen ApiError bei fehlerhaftem HTTP-Status', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ message: 'Ungültige Anmeldedaten', code: 'UNAUTHORIZED' }),
        });

        try {
            await login('test@mail.de', 'wrong');
            fail('Sollte einen Fehler werfen');
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(401);
            expect((error as ApiError).message).toBe('Ungültige Anmeldedaten');
            expect((error as ApiError).code).toBe('UNAUTHORIZED');
        }
    });

    it('lädt Benutzer mit korrektem Authorization-Header', async () => {
        const mockUsers = [{ userId: '2', displayName: 'User 2', isOnline: true }];
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockUsers,
        });

        const result = await getUsers('valid-token');

        expect(global.fetch).toHaveBeenCalledWith(`${GATEWAY_HTTP_URL}/api/users`, {
            headers: { Authorization: 'Bearer valid-token' },
        });
        expect(result).toEqual(mockUsers);
    });
});