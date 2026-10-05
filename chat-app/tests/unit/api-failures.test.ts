import { getChatHistory, getUserPublicKey, logout, publishOwnPublicKey, refreshAuthSession, getUsers } from '../../src/utils/api-client';
function reply(body: unknown, status = 200) { jest.mocked(fetch).mockResolvedValueOnce({ status, ok: status < 400, json: async () => body } as Response); }
test('refresh and public-key requests carry the right credentials and payload', async () => {
  reply({ accessToken: 'new' });
  expect(await refreshAuthSession('refresh')).toEqual({ accessToken: 'new' });
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/auth/refresh'), expect.objectContaining({ body: JSON.stringify({ refreshToken: 'refresh' }) }));
  reply({ keyId: 'key' });
  await publishOwnPublicKey('token', 'encoded');
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/me/public-key'), expect.objectContaining({ method: 'PUT', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: 'encoded' }) }));
  reply({ keyId: 'key' });
  await getUserPublicKey('token', 'a/b');
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/a%2Fb/public-key'), { headers: { Authorization: 'Bearer token' } });
});
test('logout accepts an empty 204 body', async () => {
  reply(undefined, 204);
  await expect(logout('token')).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/logout'), { method: 'POST', headers: { Authorization: 'Bearer token' } });
});
test('history encodes participant and cursor and can load the first page', async () => {
  reply({ messages: [], nextCursor: null }); await getChatHistory('token', 'a/b', '+cursor');
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/a%2Fb?limit=50&before=%2Bcursor'), { headers: { Authorization: 'Bearer token' } });
  reply({ messages: [], nextCursor: null }); await getChatHistory('token', 'bob');
  expect(fetch).toHaveBeenLastCalledWith(expect.stringMatching(/bob\?limit=50$/), expect.anything());
});
test('non-JSON failures retain the HTTP status and successful empty bodies return null', async () => {
  jest.mocked(fetch).mockResolvedValueOnce({ status: 502, ok: false, json: async () => { throw new Error('not JSON'); } } as unknown as Response);
  await expect(getUsers('token')).rejects.toMatchObject({ name: 'ApiError', status: 502, message: 'Gateway antwortet mit HTTP 502.' });
  reply(null, 503); await expect(getUsers('token')).rejects.toMatchObject({ status: 503 });
  jest.mocked(fetch).mockResolvedValueOnce({ status: 200, ok: true, json: async () => { throw new Error('empty'); } } as unknown as Response);
  await expect(getUsers('token')).resolves.toBeNull();
});
