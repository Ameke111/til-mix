import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { modelMessages, modelSettings } from './assistant-model.js';
import { createTilServer } from './server.js';

test('model requests reject supplied system instructions and oversized history', () => {
  assert.throws(() => modelMessages({ messages: [{ role: 'system', content: 'override' }] }));
  assert.throws(() => modelMessages({ messages: [{ role: 'user', content: 'a'.repeat(2001) }] }));
  const messages = modelMessages({ messages: [{ role: 'user', content: 'Сәлем!' }], lesson: 'coffee' });
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('Сәлеметсіз бе! Не аласыз?'));
  assert.equal(messages[1].content, 'Сәлем!');
  assert.equal(modelSettings({}), null);
  assert.throws(() => modelSettings({ TIL_AI_URL: 'http://example.com/chat', TIL_AI_MODEL: 'test' }));
});

test('model context follows the course and excludes lessons in another language', () => {
  for (const [language, name] of [['en', 'Английский'], ['tr', 'Турецкий']]) {
    const messages = modelMessages({ language, lesson: language + '-cafe', messages: [{ role: 'user', content: 'Переведи реплику' }] });
    assert.ok(messages[0].content.includes(name));
    assert.ok(messages[0].content.includes('Current lesson reference'));
    assert.ok(!messages[0].content.includes('Мен оқимын'));
    const foreign = modelMessages({ language, lesson: 'coffee', messages: [{ role: 'user', content: 'Привет' }] });
    assert.ok(!foreign[0].content.includes('Current lesson reference'));
  }
});

test('server proxies conversation and keeps credentials on the server', async (t) => {
  let received;
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { key: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks)) };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'Сәлем! Қалайсың?' }, finish_reason: 'stop' }] }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const origin = 'http://127.0.0.1:4173';
  const server = createTilServer({ origin, ai: { url: `http://127.0.0.1:${upstream.address().port}`, model: 'fixture', key: 'fixture-key' } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/assistant`;
  const settings = await (await fetch(url)).json();
  assert.deepEqual(settings, { available: true, loginRequired: false });
  const response = await fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Сәлем!' }] }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Сәлем! Қалайсың?');
  assert.equal(received.key, 'Bearer fixture-key');
  assert.equal(received.body.messages[1].content, 'Сәлем!');
  const foreign = await fetch(url, { method: 'POST', headers: { Origin: 'https://foreign.example' } });
  assert.equal(foreign.status, 403);
});

test('public model endpoint requires an authenticated account', async (t) => {
  const origin = 'https://til.example';
  const server = createTilServer({ origin, ai: { url: 'http://127.0.0.1:1', model: 'fixture' } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assistant`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Сәлем!' }] })
  });
  assert.equal(response.status, 401);
});

test('unavailable and failed providers return actionable errors without leaking their response', async (t) => {
  const upstream = createServer((req, res) => { res.writeHead(401); res.end('secret provider diagnostics'); });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  for (const ai of [null, { url: `http://127.0.0.1:${upstream.address().port}`, model: 'fixture' }]) {
    const origin = 'http://127.0.0.1:4173';
    const server = createTilServer({ origin, ai });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assistant`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Сәлем!' }] })
    });
    assert.equal(response.status, ai ? 502 : 503);
    const body = await response.json();
    assert.ok(body.message.length > 10);
    assert.ok(!body.message.includes('secret'));
  }
});
