import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTilServer } from './server.js';

const origin = 'http://127.0.0.1:4173';
const passphrase = 'учебная фраза для проверки';
const candidate = (login) => ({ login, name: 'Тестовый ученик', password: passphrase, accept: true });

async function start(dbPath, requestOrigin = origin) {
  const server = createTilServer({ dbPath, origin: requestOrigin });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/';
  const send = (path, { method = 'GET', body, cookie, originHeader = requestOrigin } = {}) => {
    const headers = { Origin: originHeader };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const close = () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return { send, close };
}

async function register(send, login) {
  const result = await send('register', { method: 'POST', body: candidate(login) });
  assert.equal(result.status, 201);
  const header = result.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  return { header, cookie: header.split(';')[0], payload: await result.json() };
}

test('registration validates controls, revokes sessions on logout and rejects writes from another origin', async (t) => {
  const { send, close } = await start();
  t.after(close);
  const foreign = await send('register', { method: 'POST', originHeader: 'http://example.org', body: candidate('alice') });
  assert.equal(foreign.status, 403);
  const noConsent = await send('register', { method: 'POST', body: { ...candidate('alice'), accept: false } });
  assert.equal(noConsent.status, 400);
  const short = await send('register', { method: 'POST', body: { ...candidate('alice'), password: 'short' } });
  assert.equal(short.status, 400);
  const { cookie, payload } = await register(send, 'alice');
  assert.equal(payload.user.login, 'alice');
  assert.deepEqual(Object.keys(payload.user), ['login', 'name', 'weeklyGoal']);
  const duplicate = await send('register', { method: 'POST', body: candidate('Alice') });
  assert.equal(duplicate.status, 409);
  const invalid = await send('login', { method: 'POST', body: { login: 'alice', password: 'wrong' } });
  assert.equal(invalid.status, 401);
  const logged = await send('account', { cookie });
  assert.equal((await logged.json()).user.login, 'alice');
  const loggedOut = await send('logout', { method: 'POST', cookie });
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  const rejected = await send('feedback', { cookie });
  assert.equal(rejected.status, 401);
});

test('progress and feedback are isolated per account and stale revisions do not overwrite saved data', async (t) => {
  const { send, close } = await start();
  t.after(close);
  const first = (await register(send, 'one')).cookie;
  const second = (await register(send, 'two')).cookie;
  const savedProgress = { bestQuiz: 4, favorites: ['Сәлем!'] };
  const firstSave = await send('progress', { method: 'PUT', cookie: first, body: { revision: 0, progress: savedProgress } });
  assert.deepEqual(await firstSave.json(), { revision: 1 });
  const conflict = await send('progress', { method: 'PUT', cookie: first, body: { revision: 0, progress: { bestQuiz: 0 } } });
  assert.equal(conflict.status, 409);
  const savedFirst = await (await send('account', { cookie: first })).json();
  const savedSecond = await (await send('account', { cookie: second })).json();
  assert.deepEqual(savedFirst.progress, savedProgress);
  assert.deepEqual(savedSecond.progress, {});

  const patched = await send('account', { method: 'PATCH', cookie: first, body: { name: 'Данияр', weeklyGoal: 5 } });
  assert.deepEqual((await patched.json()).user, { login: 'one', name: 'Данияр', weeklyGoal: 5 });
  const note = await send('feedback', { method: 'POST', cookie: first, body: { category: 'idea', message: 'Пометка для учебной проверки.' } });
  assert.equal(note.status, 201);
  assert.equal((await (await send('feedback', { cookie: first })).json()).entries.length, 1);
  assert.deepEqual(await (await send('feedback', { cookie: second })).json(), { entries: [] });
});

test('account survives restart, sets Secure when HTTPS is configured and can be deleted with its data', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'til-mix-test-'));
  const path = join(folder, 'test.sqlite');
  const certificateOrigin = 'https://til.test';
  let instance = await start(path, certificateOrigin);
  t.after(async () => {
    await instance.close();
    await rm(folder, { force: true, recursive: true });
  });
  const { cookie, header } = await register(instance.send, 'persistent');
  assert.match(header, /Secure/);
  await instance.close();
  instance = await start(path, certificateOrigin);
  assert.equal((await (await instance.send('account', { cookie })).json()).user.login, 'persistent');
  const denied = await instance.send('account', { method: 'DELETE', cookie, body: { password: 'wrong' } });
  assert.equal(denied.status, 401);
  const removed = await instance.send('account', { method: 'DELETE', cookie, body: { password: passphrase } });
  assert.equal(removed.status, 200);
  assert.deepEqual(await (await instance.send('account', { cookie })).json(), { user: null });
  const retry = await instance.send('login', { method: 'POST', body: { login: 'persistent', password: passphrase } });
  assert.equal(retry.status, 401);
});
