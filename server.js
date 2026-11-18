import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { defaultDatabase, openDatabase } from './database.js';
import { demoLogin, seedDemo } from './demo-data.js';

const keyFor = promisify(scrypt);
const hashOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const sessionSeconds = 7 * 24 * 60 * 60;
const bodyLimit = 128 * 1024;
const feedbackCategories = new Set(['lesson', 'interface', 'idea']);
const types = { js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', wav: 'audio/wav' };

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const invalid = (message) => new RequestError(400, 'invalid', message);
const loginRequired = () => new RequestError(401, 'login_required', 'Войди в аккаунт, чтобы продолжить.');
const invalidCredentials = () => new RequestError(401, 'bad_credentials', 'Проверь логин и пароль.');

function reply(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function sendRecording(req, res, file, headers) {
  const base = { ...headers, 'Accept-Ranges': 'bytes' };
  const range = req.method === 'GET' && !req.headers['if-range'] && /^bytes=(\d*)-(\d*)$/i.exec(req.headers.range ?? '');
  if (!range || (!range[1] && !range[2])) {
    res.writeHead(200, { ...base, 'Content-Length': file.length });
    return res.end(req.method === 'HEAD' ? undefined : file);
  }
  const first = range[1] ? Number(range[1]) : Math.max(0, file.length - Number(range[2]));
  const last = range[1] && range[2] ? Math.min(file.length - 1, Number(range[2])) : file.length - 1;
  if (first > last) {
    res.writeHead(416, { ...base, 'Content-Range': 'bytes */' + file.length, 'Content-Length': 0 });
    return res.end();
  }
  const body = file.subarray(first, last + 1);
  res.writeHead(206, {
    ...base, 'Content-Range': 'bytes ' + first + '-' + last + '/' + file.length, 'Content-Length': body.length
  });
  return res.end(body);
}

async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'content_type', 'Ожидается форма в формате JSON.');
  }
  if (Number(req.headers['content-length']) > bodyLimit) {
    throw new RequestError(413, 'too_large', 'Данные слишком большие.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > bodyLimit) throw new RequestError(413, 'too_large', 'Данные слишком большие.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // Return the same error for malformed JSON and for unsupported shapes.
  }
  throw invalid('Проверь заполнение формы.');
}

function loginName(input) {
  const value = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!/^[a-z0-9_-]{3,24}$/.test(value)) throw invalid('Логин: от 3 до 24 латинских букв, цифр, дефисов или подчёркиваний.');
  return value;
}

function displayName(input) {
  const value = typeof input === 'string' ? input.trim().normalize('NFC') : '';
  if (!value || value.length > 36 || /[\p{C}]/u.test(value)) throw invalid('Укажи имя или псевдоним до 36 символов.');
  return value;
}

function passwordInput(input, min = 1) {
  if (typeof input !== 'string' || input.length < min || input.length > 128) {
    throw invalid(min === 12 ? 'Пароль должен содержать от 12 до 128 символов.' : 'Введи пароль.');
  }
  return input;
}

function sessionDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

function sessionId(req, cookieName) {
  const entry = req.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(cookieName + '='));
  const token = entry?.slice(cookieName.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? sessionDigest(token) : null;
}

function expiredCookie(secure, cookieName) {
  return cookieName + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (secure ? '; Secure' : '');
}

function validationHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

function safeProgress(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object') throw invalid('Формат прогресса не поддерживается.');
  const subset = Object.fromEntries(['sessions', 'favorites', 'bestQuiz', 'translated', 'activeDays', 'challengeDays', 'review', 'game', 'mistakes']
    .filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]));
  const encoded = JSON.stringify(subset);
  if (Buffer.byteLength(encoded) > 96 * 1024) throw new RequestError(413, 'too_large', 'Файл прогресса слишком большой.');
  return encoded;
}

function createThrottle() {
  const buckets = new Map();
  return (key, limit, interval) => {
    const now = Date.now();
    for (const [oldKey, bucket] of buckets) {
      if (bucket.until <= now) buckets.delete(oldKey);
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 3000) throw new RequestError(429, 'slow_down', 'Слишком много запросов. Попробуй позже.');
      bucket = { count: 0, until: now + interval };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) throw new RequestError(429, 'slow_down', 'Слишком много попыток. Подожди несколько минут.');
  };
}

export function createTilServer({ dbPath = ':memory:', staticDir = 'dist', origin = 'http://127.0.0.1:4173', demo = false } = {}) {
  if (demo && (dbPath !== ':memory:' || new URL(origin).hostname !== '127.0.0.1')) {
    throw new Error('Демо запускается только на 127.0.0.1 с базой в памяти.');
  }
  const publicOrigin = new URL(origin).origin;
  const secure = publicOrigin.startsWith('https:');
  const cookieName = demo ? 'til_demo_session' : 'til_session';
  const db = openDatabase(dbPath);
  if (demo) seedDemo(db);
  const q = (sql) => db.prepare(sql);
  const fetchLogin = q('SELECT * FROM accounts WHERE login = ?');
  const fetchAccount = q('SELECT * FROM accounts WHERE id = ?');
  const findSession = q('SELECT a.* FROM accounts a JOIN sessions s ON a.id = s.account_id WHERE s.digest = ? AND s.expires > ?');
  const addSession = q('INSERT INTO sessions(digest,account_id,expires) VALUES(?,?,?)');
  const deleteSession = q('DELETE FROM sessions WHERE digest = ?');
  const expireSessions = q('DELETE FROM sessions WHERE expires <= ?');
  const expireNotes = q('DELETE FROM feedback WHERE created <= ?');
  const throttle = createThrottle();
  const dummySalt = randomBytes(16).toString('hex');
  const dummyKey = randomBytes(64);
  let activeHashes = 0;

  async function derive(password, salt) {
    if (activeHashes >= 2) throw new RequestError(429, 'slow_down', 'Сервер занят. Повтори попытку через несколько секунд.');
    activeHashes++;
    try {
      return await keyFor(password, Buffer.from(salt, 'hex'), 64, hashOptions);
    } finally {
      activeHashes--;
    }
  }

  async function verifyPassword(account, password) {
    const key = await derive(password, account?.salt || dummySalt);
    return timingSafeEqual(key, account ? Buffer.from(account.password_hash, 'hex') : dummyKey) && Boolean(account);
  }

  function expose(account) {
    return {
      user: { login: account.login, name: account.name, weeklyGoal: account.weekly_goal, ...(account.admin ? { admin: true } : {}) },
      progress: JSON.parse(account.progress),
      revision: account.progress_rev
    };
  }

  function signIn(req, res, account, status) {
    const token = randomBytes(32).toString('base64url');
    const current = sessionId(req, cookieName);
    if (current) deleteSession.run(current);
    const now = Date.now();
    expireSessions.run(now);
    addSession.run(sessionDigest(token), account.id, now + sessionSeconds * 1000);
    reply(res, status, expose(account), {
      'Set-Cookie': cookieName + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + sessionSeconds + (secure ? '; Secure' : '')
    });
  }

  async function serveAdmin(req, res, url, account) {
    if (!account.admin) throw new RequestError(403, 'admin_required', 'Этот раздел доступен владельцу сайта.');
    if (req.method === 'GET' && url.pathname === '/api/admin/feedback') {
      const state = url.searchParams.get('state') ?? 'open';
      const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : Number.MAX_SAFE_INTEGER;
      if (!['open', 'closed'].includes(state) || !Number.isSafeInteger(before) || before < 1) {
        throw invalid('Некорректный фильтр обращений.');
      }
      expireNotes.run(Date.now() - 90 * 86400000);
      const rows = q('SELECT id,category,message,created,state FROM feedback WHERE state = ? AND id < ? ORDER BY id DESC LIMIT 21')
        .all(state, before);
      const next = rows.length > 20 ? rows[19].id : null;
      const counts = q("SELECT count(*) FILTER (WHERE state = 'open') AS open, count(*) FILTER (WHERE state = 'closed') AS closed FROM feedback").get();
      return reply(res, 200, { entries: rows.slice(0, 20), next, counts, accounts: q('SELECT count(*) AS total FROM accounts').get().total });
    }
    const id = Number(url.pathname.match(/^\/api\/admin\/feedback\/(\d+)$/)?.[1]);
    if (req.method !== 'PATCH' || !Number.isSafeInteger(id) || id < 1) {
      throw new RequestError(404, 'not_found', 'Такой страницы нет.');
    }
    const { state } = await jsonBody(req);
    if (!['open', 'closed'].includes(state)) throw invalid('Выбери допустимый статус обращения.');
    if (!fetchAccount.get(account.id)?.admin) throw new RequestError(403, 'admin_required', 'Доступ владельца отозван.');
    const updated = q('UPDATE feedback SET state = ? WHERE id = ? AND created > ?')
      .run(state, id, Date.now() - 90 * 86400000);
    if (!updated.changes) throw new RequestError(404, 'not_found', 'Обращение больше недоступно.');
    return reply(res, 200, { id, state });
  }

  async function serveApi(req, res, url) {
    const path = url.pathname;
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== publicOrigin) {
      throw new RequestError(403, 'origin', 'Открой форму с адреса этого приложения.');
    }
    const ip = req.socket.remoteAddress || 'local';
    const digest = sessionId(req, cookieName);
    const account = digest ? findSession.get(digest, Date.now()) : undefined;
    const method = req.method;
    if (method === 'GET' && path === '/api/health') return reply(res, 200, { ok: true });
    if (method === 'GET' && path === '/api/account') return reply(res, 200, account ? expose(account) : { user: null });
    if (path === '/api/demo/admin' && method === 'POST') {
      if (!demo || req.socket.remoteAddress !== '127.0.0.1') {
        throw new RequestError(404, 'not_found', 'Такой страницы нет.');
      }
      const owner = fetchLogin.get(demoLogin);
      if (!owner?.admin) throw new RequestError(409, 'demo_reset', 'Перезапусти демо, чтобы восстановить аккаунт.');
      return signIn(req, res, owner, 200);
    }
    if (method === 'POST' && path === '/api/register') {
      throttle('register:' + ip, 8, 15 * 60 * 1000);
      const body = await jsonBody(req);
      const login = loginName(body.login);
      const name = displayName(body.name);
      const password = passwordInput(body.password, 12);
      if (body.accept !== true) throw invalid('Подтверди согласие на сохранение данных аккаунта.');
      const salt = randomBytes(16).toString('hex');
      const key = await derive(password, salt);
      const result = q('INSERT OR IGNORE INTO accounts(login,name,salt,password_hash) VALUES(?,?,?,?)').run(login, name, salt, key.toString('hex'));
      if (!result.changes) throw new RequestError(409, 'login_taken', 'Этот логин занят. Выбери другой.');
      return signIn(req, res, fetchAccount.get(result.lastInsertRowid), 201);
    }
    if (method === 'POST' && path === '/api/login') {
      throttle('login:' + ip, 16, 10 * 60 * 1000);
      const body = await jsonBody(req);
      const login = loginName(body.login);
      throttle('login:' + ip + ':' + login, 6, 10 * 60 * 1000);
      const user = fetchLogin.get(login);
      if (!await verifyPassword(user, passwordInput(body.password))) throw invalidCredentials();
      return signIn(req, res, user, 200);
    }
    if (method === 'POST' && path === '/api/logout') {
      if (digest) deleteSession.run(digest);
      return reply(res, 200, { user: null }, { 'Set-Cookie': expiredCookie(secure, cookieName) });
    }
    if (!account) throw loginRequired();
    if (path.startsWith('/api/admin/')) return serveAdmin(req, res, url, account);
    if (method === 'PATCH' && path === '/api/account') {
      const body = await jsonBody(req);
      const goal = body.weeklyGoal;
      if (!Number.isInteger(goal) || goal < 1 || goal > 7) throw invalid('Выбери от одного до семи дней.');
      q('UPDATE accounts SET name = ?, weekly_goal = ? WHERE id = ?').run(displayName(body.name), goal, account.id);
      return reply(res, 200, { user: expose(fetchAccount.get(account.id)).user });
    }
    if (method === 'DELETE' && path === '/api/account') {
      throttle('delete:' + account.id, 5, 10 * 60 * 1000);
      const body = await jsonBody(req);
      if (!await verifyPassword(account, passwordInput(body.password))) throw invalidCredentials();
      q('DELETE FROM accounts WHERE id = ?').run(account.id);
      return reply(res, 200, { user: null }, { 'Set-Cookie': expiredCookie(secure, cookieName) });
    }
    if (method === 'PUT' && path === '/api/progress') {
      const body = await jsonBody(req);
      if (!Number.isInteger(body.revision) || body.revision < 0) throw invalid('Не удалось сверить версию прогресса.');
      const result = q('UPDATE accounts SET progress = ?, progress_rev = progress_rev + 1 WHERE id = ? AND progress_rev = ?')
        .run(safeProgress(body.progress), account.id, body.revision);
      if (!result.changes) throw new RequestError(409, 'revision_conflict', 'Прогресс изменился в другой вкладке.');
      return reply(res, 200, { revision: body.revision + 1 });
    }
    if (path === '/api/feedback' && method === 'GET') {
      expireNotes.run(Date.now() - 90 * 86400000);
      const entries = q('SELECT id,category,message,created,state FROM feedback WHERE account_id = ? ORDER BY id DESC LIMIT 20').all(account.id);
      return reply(res, 200, { entries });
    }
    if (path === '/api/feedback' && method === 'POST') {
      throttle('feedback:' + account.id, 12, 60 * 60 * 1000);
      const body = await jsonBody(req);
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!feedbackCategories.has(body.category) || message.length < 8 || message.length > 1200) {
        throw invalid('Выбери тему и напиши от 8 до 1200 символов.');
      }
      const now = Date.now();
      expireNotes.run(now - 90 * 86400000);
      const added = q('INSERT INTO feedback(account_id,category,message,created) VALUES(?,?,?,?)')
        .run(account.id, body.category, message, now);
      return reply(res, 201, { id: added.lastInsertRowid });
    }
    throw new RequestError(404, 'not_found', 'Такой страницы нет.');
  }

  const server = createServer(async (req, res) => {
    validationHeaders(res);
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, publicOrigin);
      const path = url.pathname;
      if (path.startsWith('/api/')) {
        await serveApi(req, res, url);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new RequestError(405, 'method', 'Метод не поддерживается.');
      if (path === '/' || path === '/index.html') {
        const page = readFileSync(resolve(staticDir, 'index.html'), 'utf8')
          .replace('</head>', '<meta name="til-server" content="accounts">'
            + (demo ? '<meta name="til-demo" content="owner">' : '') + '</head>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : page);
      }
      const asset = path.match(/^\/assets\/([a-zA-Z0-9_-]+\.(js|css|svg|wav))$/);
      if (!asset) throw new RequestError(404, 'not_found', 'Такой страницы нет.');
      const file = readFileSync(resolve(staticDir, 'assets', asset[1]));
      const headers = { 'Content-Type': types[asset[2]], 'Cache-Control': 'public, max-age=31536000, immutable' };
      if (asset[2] === 'wav') return sendRecording(req, res, file, headers);
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch (error) {
      if (error instanceof RequestError) reply(res, error.status, { code: error.code, message: error.message });
      else if (error.code === 'ENOENT') reply(res, 404, { code: 'not_found', message: 'Сначала собери приложение командой npm run build.' });
      else reply(res, 500, { code: 'internal', message: 'Временная ошибка сервера.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.TIL_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 4173);
  const origin = process.env.TIL_ORIGIN || 'http://127.0.0.1:' + port;
  if (!['127.0.0.1', '::1'].includes(host) && !origin.startsWith('https://')) {
    throw new Error('A non-loopback server requires TIL_ORIGIN with HTTPS and a TLS reverse proxy.');
  }
  const root = dirname(fileURLToPath(import.meta.url));
  const dbPath = process.env.TIL_DB ? resolve(process.env.TIL_DB) : defaultDatabase;
  mkdirSync(dirname(dbPath), { recursive: true });
  createTilServer({ dbPath, origin, staticDir: resolve(root, 'dist') })
    .listen(port, host, () => console.log('Тіл Mix: ' + origin));
}
