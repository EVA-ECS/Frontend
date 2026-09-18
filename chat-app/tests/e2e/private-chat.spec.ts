/// <reference types="node" />
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Explicitly opt in: this test creates disposable accounts/messages in a DEMO project.
const enabled = process.env.EVA_ALLOW_TEST_WRITES === '1';
const envFile = process.env.EVA_E2E_ENV_FILE;
const settings: Record<string, string> = {};
if (enabled && envFile) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) settings[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const gateway = 'http://localhost:18080';
type Account = { id: string; email: string; password: string };
type Row = { id: string; room_id: string; sender_id: string; receiver_id: string; content: string };

async function admin(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${settings.SUPABASE_URL}${path}`, {
    method, headers: { apikey: settings.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Demo fixture operation failed: HTTP ${response.status} (${method} ${path.split('?')[0]}).`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function login(page: Page, account: Account) {
  await page.goto('/');
  await page.getByPlaceholder('email@beispiel.de').fill(account.email);
  await page.getByPlaceholder('••••••••').fill(account.password);
  const connected = page.waitForEvent('websocket', { timeout: 30_000 });
  await page.getByText('Anmelden', { exact: true }).click();
  await connected;
  await expect(page.getByLabel('Abmelden', { exact: true })).toBeVisible();
}
async function select(page: Page, account: Account) {
  await page.getByLabel(`Chat mit ${account.email}`, { exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByLabel('Nachricht', { exact: true }).fill(text);
  await page.getByLabel('Nachricht senden', { exact: true }).click();
}
async function token(page: Page): Promise<string> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('eva.auth.session')!).accessToken);
}
function container(action: 'pause' | 'unpause' | 'stop' | 'start', service: 'storage-worker' | 'rabbitmq' | 'redis') {
  // Never target the original project. Refuse if the named container has changed ownership.
  const name = `eva-integration-${service}-1`;
  const project = execFileSync('docker', ['inspect', name, '--format', '{{index .Config.Labels "com.docker.compose.project"}}'], { encoding: 'utf8' }).trim();
  if (project !== 'eva-integration') throw new Error('Refusing to alter a non-test container.');
  execFileSync('docker', [action, name], { stdio: 'pipe' });
}

test('private chat reaches both screens, survives refresh/offline, and rejects outsiders', async ({ browser }) => {
  test.skip(!enabled || !envFile, 'Set EVA_ALLOW_TEST_WRITES=1 and EVA_E2E_ENV_FILE for the school/demo project.');
  if (!settings.SUPABASE_URL || !settings.SUPABASE_SECRET_KEY || !settings.SUPABASE_PUBLISHABLE_KEY)
    throw new Error('Demo Supabase settings are incomplete.');
  // A separate explicit project confirmation prevents accidentally using unrelated credentials.
  if (new URL(settings.SUPABASE_URL).hostname !== process.env.EVA_E2E_PROJECT_HOST)
    throw new Error('Set EVA_E2E_PROJECT_HOST to the confirmed DEMO project hostname.');
  const accounts: Account[] = [];
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const suffix = randomUUID();
  let paused = false;
  let stoppedService: 'rabbitmq' | 'redis' | null = null;
  const rows = () => admin(`/rest/v1/messages?select=id,room_id,sender_id,receiver_id,content&sender_id=in.(${accounts.map(a => a.id).join(',')})`) as Promise<Row[]>;
  try {
    await test.step('Create three disposable demo accounts', async () => {
      for (const role of ['alice', 'bob', 'outsider']) {
        const email = `eva-e2e-${role}-${suffix}@example.com`;
        const password = `${randomUUID()}Aa!9`;
        const user = await admin('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
        accounts.push({ id: user.id, email, password });
      }
    });
    const [alice, bob, outsider] = accounts;
    const a = await contexts[0].newPage();
    let b = await contexts[1].newPage();
    const c = await contexts[2].newPage();
    await test.step('Log in through the real UI and publish browser public keys', async () => {
      await Promise.all([login(a, alice), login(b, bob), login(c, outsider)]);
      await Promise.all([select(a, bob), select(b, alice)]);
    });
    const first = `Alice concurrent first ${suffix}`;
    const second = `Bob concurrent first ${suffix}`;
    await test.step('Concurrent first messages reach the opposite screen and create one room', async () => {
      await Promise.all([send(a, first), send(b, second)]);
      await expect(a.getByText(second, { exact: true })).toBeVisible();
      await expect(b.getByText(first, { exact: true })).toBeVisible();
      const stored = await rows();
      expect(stored).toHaveLength(2);
      expect(new Set(stored.map(row => row.room_id)).size).toBe(1);
      expect(stored.every(row => row.receiver_id && !row.content.includes(first) && !row.content.includes(second))).toBe(true);
      for (const row of stored) expect(JSON.parse(row.content).version).toBe(1);
    });
    await test.step('Refresh restores received AND own sent history without duplicates', async () => {
      await Promise.all([a.reload(), b.reload()]);
      await Promise.all([select(a, bob), select(b, alice)]);
      for (const page of [a, b]) {
        await expect(page.getByText(first, { exact: true })).toHaveCount(1);
        await expect(page.getByText(second, { exact: true })).toHaveCount(1);
        await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible();
      }
    });
    await test.step('A third account cannot read the conversation through Gateway or Supabase', async () => {
      const outsiderToken = await token(c);
      const response = await fetch(`${gateway}/api/chat/history/${alice.id}`, { headers: { Authorization: `Bearer ${outsiderToken}` } });
      expect(response.status).toBe(200);
      expect((await response.json()).messages).toEqual([]);
      const ids = (await rows()).map(row => row.id).join(',');
      const direct = await fetch(`${settings.SUPABASE_URL}/rest/v1/messages?select=id&id=in.(${ids})`, {
        headers: { apikey: settings.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${outsiderToken}` },
      });
      expect(direct.status).toBe(200);
      expect(await direct.json()).toEqual([]);
      expect((await fetch(`${gateway}/api/chat/history/${alice.id}`)).status).toBe(401);
    });
    await test.step('History pagination returns each message once', async () => {
      const headers = { Authorization: `Bearer ${await token(a)}` };
      const firstPage = await (await fetch(`${gateway}/api/chat/history/${bob.id}?limit=1`, { headers })).json();
      expect(firstPage.messages).toHaveLength(1);
      expect(firstPage.nextCursor).toBeTruthy();
      const older = await (await fetch(`${gateway}/api/chat/history/${bob.id}?limit=1&before=${encodeURIComponent(firstPage.nextCursor)}`, { headers })).json();
      expect(older.messages).toHaveLength(1);
      expect(older.messages[0].messageId).not.toBe(firstPage.messages[0].messageId);
      expect(older.nextCursor).toBeNull();
    });
    await test.step('Offline delivery is restored from the database when Bob returns', async () => {
      await b.close();
      const offline = `Offline ${suffix}`;
      await send(a, offline);
      await expect.poll(async () => (await rows()).length).toBe(3);
      b = await contexts[1].newPage();
      await b.goto('/');
      await select(b, alice);
      await expect(b.getByText(offline, { exact: true })).toBeVisible();
    });
    await test.step('Paused Storage prevents delivery; publishing is not shown as saved', async () => {
      container('pause', 'storage-worker'); paused = true;
      const held = `Waiting for storage ${suffix}`;
      await send(a, held);
      await expect(a.getByText('An Warteschlange übergeben', { exact: true }).last()).toBeVisible();
      await expect(b.getByText(held, { exact: true })).toHaveCount(0);
      expect((await rows()).length).toBe(3);
      container('unpause', 'storage-worker'); paused = false;
      await expect(b.getByText(held, { exact: true })).toBeVisible();
      await expect.poll(async () => (await rows()).length).toBe(4);
    });
    await test.step('A broker outage gives an unconfirmed result, then publishing recovers', async () => {
      container('stop', 'rabbitmq'); stoppedService = 'rabbitmq';
      await send(a, `Broker unavailable ${suffix}`);
      await expect(a.getByText('Versand nicht bestätigt', { exact: true }).first()).toBeVisible();
      expect((await rows()).length).toBe(4);
      container('start', 'rabbitmq'); stoppedService = null;
      await expect.poll(() => {
        try {
          const queues = execFileSync('docker', ['exec', 'eva-integration-rabbitmq-1', 'rabbitmqctl', 'list_queues', 'name', 'consumers', '--formatter=json'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
          return JSON.parse(queues).filter((queue: { name: string; consumers: number }) => ['storage_queue', 'delivery_queue'].includes(queue.name) && queue.consumers === 1).length;
        } catch { return 0; }
      }, { timeout: 45_000 }).toBe(2);
      await send(a, `Broker recovered ${suffix}`);
      await expect(b.getByText(`Broker recovered ${suffix}`, { exact: true })).toBeVisible();
    });
    await test.step('A cache outage does not lose persisted history', async () => {
      container('stop', 'redis'); stoppedService = 'redis';
      await send(a, `Cache unavailable ${suffix}`);
      await expect.poll(async () => (await rows()).length).toBe(6);
      container('start', 'redis'); stoppedService = null;
      await b.reload();
      await select(b, alice);
      await expect(b.getByText(`Cache unavailable ${suffix}`, { exact: true })).toBeVisible();
    });
    await test.step('A tampered stored payload gives a readable error, not broken history', async () => {
      const row = (await rows()).find(row => row.sender_id === alice.id)!;
      const payload = JSON.parse(row.content);
      payload.ciphertext = (payload.ciphertext[0] === 'A' ? 'B' : 'A') + payload.ciphertext.slice(1);
      try {
        await admin(`/rest/v1/messages?id=eq.${row.id}&sender_id=eq.${alice.id}`, 'PATCH', { content: JSON.stringify(payload) });
        await b.reload();
        await select(b, alice);
        await expect(b.getByText('Nachricht nicht lesbar: Schlüssel fehlt oder Inhalt wurde verändert.', { exact: true })).toBeVisible();
      } finally {
        await admin(`/rest/v1/messages?id=eq.${row.id}&sender_id=eq.${alice.id}`, 'PATCH', { content: row.content });
      }
      await b.reload();
      await select(b, alice);
    });
    await test.step('A replacement tab stops the old tab reconnecting', async () => {
      const replacement = await contexts[0].newPage();
      await replacement.goto('/');
      await select(replacement, bob);
      await expect(a.getByText(/Dieses Fenster wurde durch eine andere Anmeldung ersetzt/)).toBeVisible();
      await send(replacement, `Replacement tab ${suffix}`);
      await expect(b.getByText(`Replacement tab ${suffix}`, { exact: true })).toBeVisible();
      await expect(a.getByText(/Dieses Fenster wurde durch eine andere Anmeldung ersetzt/)).toBeVisible();
      await replacement.screenshot({ path: 'test-results/private-chat-alice.png' });
      await b.screenshot({ path: 'test-results/private-chat-bob.png' });
    });
    await test.step('A fresh browser warns about missing keys instead of replacing the published key', async () => {
      const keyUrl = `${gateway}/api/users/${alice.id}/public-key`;
      const headers = { Authorization: `Bearer ${await token(c)}` };
      const before = await (await fetch(keyUrl, { headers })).json();
      const freshContext = await browser.newContext();
      contexts.push(freshContext);
      const fresh = await freshContext.newPage();
      await fresh.goto('/');
      await fresh.getByPlaceholder('email@beispiel.de').fill(alice.email);
      await fresh.getByPlaceholder('••••••••').fill(alice.password);
      await fresh.getByText('Anmelden', { exact: true }).click();
      await select(fresh, bob);
      await expect(fresh.getByText(/Schlüssel.*Browser|Browser.*Schlüssel/).first()).toBeVisible();
      expect(await (await fetch(keyUrl, { headers })).json()).toEqual(before);
    });
  } finally {
    if (paused) container('unpause', 'storage-worker');
    if (stoppedService) container('start', stoppedService);
    await Promise.all(contexts.map(context => context.close()));
    // Only delete this run's explicitly recorded fixture IDs, never existing users/rooms.
    if (accounts.length) {
      const stored = await rows();
      const ids = accounts.map(account => account.id).join(',');
      if (stored.length) {
        await admin(`/rest/v1/messages?id=in.(${stored.map(row => row.id).join(',')})&sender_id=in.(${ids})`, 'DELETE');
        for (const room of new Set(stored.map(row => row.room_id))) {
          await admin(`/rest/v1/room_members?room_id=eq.${room}&user_id=in.(${ids})`, 'DELETE');
          await admin(`/rest/v1/rooms?id=eq.${room}&created_by=in.(${ids})`, 'DELETE');
        }
      }
      await admin(`/rest/v1/profiles?id=in.(${ids})`, 'DELETE');
      for (const account of accounts) await admin(`/auth/v1/admin/users/${account.id}`, 'DELETE');
    }
  }
});
