import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './driver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 本文件位于 server/db/ 下，数据文件直接放在同级目录：server/db/task.db
const dbDir = __dirname;
const dbPath = process.env.DB_PATH || path.join(dbDir, 'task.db');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const { db, driver } = await openDatabase(dbPath);

// WAL 模式：读写并发更好，反复重启也不会丢数据
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    due_date     TEXT    NOT NULL,
    priority     TEXT    NOT NULL DEFAULT 'medium',
    status       TEXT    NOT NULL DEFAULT 'pending',
    client_token TEXT    UNIQUE,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

  CREATE TABLE IF NOT EXISTS ai_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '',
    result     TEXT NOT NULL DEFAULT '',
    success    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
`);

export { db, dbPath, driver };
