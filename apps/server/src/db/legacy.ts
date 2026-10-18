import type Database from 'better-sqlite3';

/**
 * 旧版原型（node:sqlite + 手写建表）的数据库没有迁移记录表。
 * 识别后由 openDatabase 备份整个文件，在新结构上重建，再从备份中按列名导入数据。
 */
export function isLegacyDatabase(sqlite: Database.Database): boolean {
  const has = (name: string) => !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return has('assets') && !has('__drizzle_migrations');
}

// 按外键依赖顺序导入；sessions 不导入（升级后需要重新登录）
const TABLES = ['settings', 'fx_rates', 'categories', 'accounts', 'assets', 'transactions', 'asset_components', 'goals', 'users'];

export function importLegacyDatabase(sqlite: Database.Database, legacyFile: string) {
  sqlite.prepare('ATTACH DATABASE ? AS legacy').run(legacyFile);
  try {
    sqlite.pragma('foreign_keys = OFF');
    sqlite.transaction(() => {
      for (const table of TABLES) {
        const exists = sqlite.prepare("SELECT 1 FROM legacy.sqlite_master WHERE type = 'table' AND name = ?").get(table);
        if (!exists) continue;
        const columnsOf = (schemaName: string) =>
          (sqlite.prepare('SELECT name FROM pragma_table_info(?, ?)').all(table, schemaName) as { name: string }[]).map((c) => c.name);
        const legacyCols = columnsOf('legacy');
        const newCols = new Set(columnsOf('main'));
        const cols = legacyCols.filter((c) => newCols.has(c));
        const select = cols.map((c) => {
          // 旧版用户名大小写不敏感，新版统一存小写
          if (table === 'users' && c === 'username') return 'lower(username)';
          // 旧版金额为 REAL，新版存为十进制文本；printf 避免出现 1e-05 这类科学计数法
          if (table === 'transactions' && ['quantity', 'price', 'amount', 'fee'].includes(c))
            return `CASE WHEN ${c} IS NULL THEN NULL ELSE rtrim(rtrim(printf('%.10f', ${c}), '0'), '.') END`;
          return `"${c}"`;
        });
        const colList = cols.map((c) => `"${c}"`).join(', ');
        sqlite.exec(`DELETE FROM main."${table}"`);
        sqlite.exec(`INSERT INTO main."${table}" (${colList}) SELECT ${select.join(', ')} FROM legacy."${table}"`);
      }
      // 保留原有自增序列，避免 ID 复用
      sqlite.exec(
        `INSERT OR REPLACE INTO main.sqlite_sequence (name, seq) SELECT name, seq FROM legacy.sqlite_sequence WHERE name IN (${TABLES.map((t) => `'${t}'`).join(',')})`,
      );
    })();
  } finally {
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec('DETACH DATABASE legacy');
  }
}
