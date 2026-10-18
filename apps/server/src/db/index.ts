import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { log } from '../logger.js';
import { createBackup } from './backup.js';
import { importLegacyDatabase, isLegacyDatabase } from './legacy.js';
import type { Locale } from '../i18n.js';
import * as schema from './schema.js';
import { seedDefaults } from './seed.js';

export type DB = BetterSQLite3Database<typeof schema>;

interface Handle {
  db: DB;
  sqlite: Database.Database;
  path: string;
}

let current: Handle | null = null;

/** 当前数据库连接（启动时由 openDatabase 初始化） */
export function getDb(): DB {
  if (!current) throw new Error('数据库尚未初始化');
  return current.db;
}

export function getSqlite(): Database.Database {
  if (!current) throw new Error('数据库尚未初始化');
  return current.sqlite;
}

function connect(file: string): Database.Database {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  return sqlite;
}

function journalEntries(migrationsDir: string): number {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
  return journal.entries.length;
}

function appliedMigrations(sqlite: Database.Database): number {
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").get();
  if (!exists) return 0;
  return (sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
}

export function schemaVersion(): number {
  return current ? appliedMigrations(current.sqlite) : 0;
}

/**
 * 打开（或创建）数据库：
 * 1. 识别旧版原型数据库，先整体备份再导入新结构；
 * 2. 有待执行的迁移时先备份，再执行迁移；失败则中止启动，避免带着半升级的数据继续运行；
 * 3. 写入默认类别与汇率。
 */
export async function openDatabase(opts: { file: string; migrationsDir: string; backupDir: string; locale?: Locale }): Promise<Handle> {
  const { file, migrationsDir, backupDir } = opts;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const existed = file !== ':memory:' && fs.existsSync(file) && fs.statSync(file).size > 0;
  let sqlite = connect(file);

  let legacyFile: string | null = null;
  if (existed && isLegacyDatabase(sqlite)) {
    log.warn('检测到旧版数据库，将先备份再迁移到新结构');
    const info = await createBackup(sqlite, backupDir, 'legacy');
    legacyFile = path.join(backupDir, info.name);
    sqlite.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
    sqlite = connect(file);
  } else if (existed) {
    const pending = journalEntries(migrationsDir) - appliedMigrations(sqlite);
    if (pending > 0) await createBackup(sqlite, backupDir, 'pre-migration');
  }

  const db = drizzle(sqlite, { schema });
  try {
    migrate(db, { migrationsFolder: migrationsDir });
  } catch (err) {
    log.fatal({ err }, '数据库迁移失败，服务未启动。迁移前的备份位于 backups 目录');
    sqlite.close();
    throw err;
  }

  if (legacyFile) {
    importLegacyDatabase(sqlite, legacyFile);
    log.info({ from: path.basename(legacyFile) }, '旧版数据已导入');
  }

  current = { db, sqlite, path: file };
  seedDefaults(db, opts.locale);
  return current;
}

export function closeDatabase() {
  if (!current) return;
  try {
    current.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    /* 忽略 */
  }
  current.sqlite.close();
  current = null;
}

/** 在一个事务中执行（better-sqlite3 为同步 API） */
export function tx<T>(fn: () => T): T {
  return getSqlite().transaction(fn)();
}

export { schema };
