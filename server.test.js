import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createTilServer } from './server.js';

const origin = 'http://127.0.0.1:4173';
const passphrase = 'учебная фраза для проверки';
const candidate = (login) => ({ login, name: 'Тестовый ученик', password: passphrase, accept: true });

async function start(dbPath, requestOrigin = origin, demo = false, staticDir) {
  const server = createTilServer({ dbPath, origin: requestOrigin, demo, staticDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const send = (path, { method = 'GET', body, cookie, originHeader = requestOrigin } = {}) => {
    const headers = { Origin: originHeader };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(url + '/api/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const close = () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return { send, close, url };
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

test('audio uses the correct MIME type and serves byte ranges for mobile playback', async (t) => {
  const fixtures = await mkdtemp(join(tmpdir(), 'til-audio-'));
  await mkdir(join(fixtures, 'assets'));
  await copyFile(new URL('./audio/bike-helmet.wav', import.meta.url), join(fixtures, 'assets', 'bike-helmet.wav'));
  const { url, close } = await start(undefined, origin, false, fixtures);
  t.after(async () => {
    await close();
    await rm(fixtures, { recursive: true, force: true });
  });
  const asset = url + '/assets/bike-helmet.wav';
  const head = await fetch(asset, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'audio/wav');
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  const length = Number(head.headers.get('content-length'));
  const first = await fetch(asset, { headers: { Range: 'bytes=0-1' } });
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('content-range'), 'bytes 0-1/' + length);
  assert.equal(await first.text(), 'RI');
  const invalid = await fetch(asset, { headers: { Range: 'bytes=' + length + '-' } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), 'bytes */' + length);
});

test('offline speech assets load with a worker-specific script policy', async (t) => {
  const fixtures = await mkdtemp(join(tmpdir(), 'til-speech-'));
  await mkdir(join(fixtures, 'assets'));
  await writeFile(join(fixtures, 'index.html'), '<head></head>');
  await writeFile(join(fixtures, 'assets', 'vosk-worker-0-0-8.js'), '// test worker');
  await writeFile(join(fixtures, 'assets', 'vosk-model-small-kz-0.42.tar.gz'), 'test archive');
  const { url, close } = await start(undefined, origin, false, fixtures);
  t.after(async () => {
    await close();
    await rm(fixtures, { recursive: true, force: true });
  });
  const page = await fetch(url);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /unsafe-eval/);
  const worker = await fetch(url + '/assets/vosk-worker-0-0-8.js');
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('content-security-policy'), /script-src 'self' 'unsafe-eval'/);
  const model = await fetch(url + '/assets/vosk-model-small-kz-0.42.tar.gz');
  assert.equal(model.headers.get('content-type'), 'application/gzip');
  assert.equal(await model.text(), 'test archive');
});

test('progress and feedback are isolated per account and stale revisions do not overwrite saved data', async (t) => {
  const { send, close } = await start();
  t.after(close);
  const first = (await register(send, 'one')).cookie;
  const second = (await register(send, 'two')).cookie;
  const savedProgress = {
    bestQuiz: 4,
    favorites: ['Сәлем!'],
    game: {
      days: { 20773: 1 },
      chapters: { city: 4 },
      review: { day: 20773, reviewed: ['Сәлем!'] },
      studio: ['coffee-order']
    }
  };
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

test('owner-only triage migrates an older database, preserves notes and allows immediate revocation', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'til-mix-admin-'));
  const path = join(folder, 'test.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, weekly_goal INTEGER NOT NULL DEFAULT 3,
      progress TEXT NOT NULL DEFAULT '{}', progress_rev INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE feedback (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE INDEX feedback_owner ON feedback(account_id, created);
    INSERT INTO accounts(login,name,salt,password_hash) VALUES ('legacy','Предыдущий ученик','','');
  `);
  legacy.prepare('INSERT INTO feedback(account_id,category,message,created) VALUES(1,?,?,?)')
    .run('idea', 'Старое обращение', Date.now());
  legacy.close();

  const { send, close } = await start(path);
  t.after(async () => {
    await close();
    await rm(folder, { force: true, recursive: true });
  });

  const owner = (await register(send, 'owner')).cookie;
  const learner = (await register(send, 'learner')).cookie;
  assert.equal((await send('admin/feedback')).status, 401);
  const forged = await send('account', { method: 'PATCH', cookie: learner, body: { name: 'Ученик', weeklyGoal: 3, admin: true } });
  assert.equal((await forged.json()).user.admin, undefined);
  assert.equal((await send('admin/feedback', { cookie: learner })).status, 403);

  const changeRole = (operation) => {
    const result = spawnSync(process.execPath, ['admin.js', operation, 'owner'], { env: { ...process.env, TIL_DB: path }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  changeRole('grant');
  assert.equal((await (await send('account', { cookie: owner })).json()).user.admin, true);
  const note = await send('feedback', { method: 'POST', cookie: learner, body: { category: 'lesson', message: 'Уточнение в первом диалоге.' } });
  assert.equal(note.status, 201);
  const { id } = await note.json();
  const incoming = await (await send('admin/feedback', { cookie: owner })).json();
  assert.deepEqual(incoming.counts, { open: 2, closed: 0 });
  assert.equal(incoming.accounts, 3);
  assert.equal(incoming.entries[1].message, 'Старое обращение');
  assert.equal(incoming.entries[1].state, 'open');
  assert.ok(!Object.hasOwn(incoming.entries[0], 'account_id'));
  assert.equal((await send('admin/feedback/' + id, { method: 'PATCH', cookie: learner, body: { state: 'closed' } })).status, 403);
  assert.equal((await send('admin/feedback/' + id, { method: 'PATCH', cookie: owner, originHeader: 'https://example.org', body: { state: 'closed' } })).status, 403);
  assert.equal((await send('admin/feedback/' + id, { method: 'PATCH', cookie: owner, body: { state: 'invalid' } })).status, 400);
  assert.equal((await send('admin/feedback/' + id, { method: 'PATCH', cookie: owner, body: { state: 'closed' } })).status, 200);
  assert.equal((await (await send('feedback', { cookie: learner })).json()).entries[0].state, 'closed');
  const completed = await (await send('admin/feedback?state=closed', { cookie: owner })).json();
  assert.deepEqual(completed.entries.map((entry) => entry.id), [id]);
  assert.equal((await send('admin/feedback/' + id, { method: 'PATCH', cookie: owner, body: { state: 'open' } })).status, 200);
  changeRole('revoke');
  assert.equal((await send('admin/feedback', { cookie: owner })).status, 403);
});

test('demo owner signs in only on the isolated server and has a separate session cookie', async (t) => {
  assert.throws(() => createTilServer({ demo: true, dbPath: 'ignored.sqlite' }), /базой в памяти/);
  assert.throws(() => createTilServer({ demo: true, origin: 'https://example.org' }), /127\.0\.0\.1/);
  const regular = await start();
  const sandbox = await start(undefined, origin, true);
  t.after(async () => { await Promise.all([regular.close(), sandbox.close()]); });

  assert.equal((await regular.send('demo/admin', { method: 'POST' })).status, 404);
  assert.equal((await sandbox.send('demo/admin', { method: 'POST', originHeader: 'https://example.org' })).status, 403);
  assert.equal((await sandbox.send('admin/feedback')).status, 401);
  const auth = await sandbox.send('demo/admin', { method: 'POST' });
  assert.equal(auth.status, 200);
  assert.equal((await auth.json()).user.admin, true);
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^til_demo_session=/);
  assert.equal((await regular.send('admin/feedback', { cookie })).status, 401);
  const inbox = await (await sandbox.send('admin/feedback', { cookie })).json();
  assert.deepEqual(inbox.counts, { open: 2, closed: 1 });
  assert.equal(inbox.accounts, 3);
});
