import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultDatabase, openDatabase } from './database.js';

const [operation, login] = process.argv.slice(2);
const path = process.env.TIL_DB ? resolve(process.env.TIL_DB) : defaultDatabase;

if (!['grant', 'revoke'].includes(operation) || !/^[a-z0-9_-]{3,24}$/.test(login ?? '') || process.argv.length !== 4) {
  console.error('Использование: npm run admin -- grant <логин> или revoke <логин>');
  process.exitCode = 1;
} else if (!existsSync(path)) {
  console.error('База не найдена. Запусти сервер и создай аккаунт владельца.');
  process.exitCode = 1;
} else {
  const db = openDatabase(path);
  try {
    const result = db.prepare('UPDATE accounts SET admin = ? WHERE login = ?').run(Number(operation === 'grant'), login);
    if (result.changes) console.log(operation === 'grant' ? 'Доступ владельца выдан.' : 'Доступ владельца отозван.');
    else {
      console.error('Аккаунт с таким логином не найден.');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
