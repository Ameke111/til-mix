import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const defaultDatabase = fileURLToPath(new URL('./.til-data/til-mix.sqlite', import.meta.url));

export function openDatabase(path) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  try {
    db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        salt TEXT NOT NULL, password_hash TEXT NOT NULL, weekly_goal INTEGER NOT NULL DEFAULT 3,
        progress TEXT NOT NULL DEFAULT '{}', progress_rev INTEGER NOT NULL DEFAULT 0,
        admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        digest TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        category TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed'))
      );
      CREATE INDEX IF NOT EXISTS feedback_owner ON feedback(account_id, created);
    `);
    if (!db.prepare('PRAGMA table_info(accounts)').all().some(({ name }) => name === 'admin')) {
      db.exec('ALTER TABLE accounts ADD COLUMN admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0,1))');
    }
    if (!db.prepare('PRAGMA table_info(feedback)').all().some(({ name }) => name === 'state')) {
      db.exec(`
        ALTER TABLE feedback RENAME TO feedback_legacy;
        CREATE TABLE feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          category TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL,
          state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed'))
        );
        INSERT INTO feedback(id,account_id,category,message,created)
          SELECT id,account_id,category,message,created FROM feedback_legacy;
        DROP TABLE feedback_legacy;
        CREATE INDEX feedback_owner ON feedback(account_id, created);
      `);
    }
    db.exec('CREATE INDEX IF NOT EXISTS feedback_queue ON feedback(state, id); COMMIT');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
