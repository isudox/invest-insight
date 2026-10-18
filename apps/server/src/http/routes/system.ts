import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import { csvImportInput, prefsInput, settingsInput, type Meta, type Settings } from '@invest-insight/shared';
import { VERSION } from '../../config.js';
import { getDb, getSqlite, schemaVersion, tx } from '../../db/index.js';
import { createBackup, isSafeName, listBackups } from '../../db/backup.js';
import { fxRates } from '../../db/schema.js';
import { loadDemo, resetAll } from '../../domain/demo.js';
import { analyzeCsv, commitCsv, CsvError, exportTransactionsCsv } from '../../domain/txCsv.js';
import { toDecimalString } from '../../domain/ledger.js';
import { getBaseCurrency, getFxRates, getPrefs, putSetting, setPrefs } from '../../domain/prefs.js';
import { log } from '../../logger.js';
import { body, HttpError, type AppEnv } from '../context.js';

const EXPORT_TABLES = ['settings', 'fx_rates', 'categories', 'accounts', 'assets', 'transactions', 'asset_components', 'goals'] as const;

const importSchema = z.object({
  app: z.literal('invest-insight'),
  version: z.number().optional(),
  settings: z.array(z.object({ key: z.string(), value: z.string() })),
  fx_rates: z.array(z.object({ currency: z.string(), rate: z.number() })),
  categories: z.array(z.record(z.unknown())),
  accounts: z.array(z.record(z.unknown())).default([]),
  assets: z.array(z.record(z.unknown())),
  transactions: z.array(z.record(z.unknown())),
  asset_components: z.array(z.record(z.unknown())).default([]),
  goals: z.array(z.record(z.unknown())).default([]),
});

export const systemRoutes = new Hono<AppEnv>()
  .get('/auth/me', (c) => c.json(c.get('user')))
  .get('/meta', (c) => {
    const cfg = c.get('config');
    const meta: Meta = {
      version: VERSION,
      node: process.version,
      schema_version: schemaVersion(),
      backup_cron: cfg.BACKUP_CRON === 'off' ? null : cfg.BACKUP_CRON,
      backup_keep: cfg.BACKUP_KEEP,
    };
    return c.json(meta);
  })
  .get('/settings', (c) => {
    const cfg = c.get('config');
    const s: Settings = { base_currency: getBaseCurrency(), fx_rates: getFxRates(), data_dir: cfg.DATA_DIR, db_path: cfg.dbPath };
    return c.json(s);
  })
  .put('/settings', async (c) => {
    const b = await body(c, settingsInput);
    tx(() => {
      putSetting('base_currency', b.base_currency);
      const db = getDb();
      db.delete(fxRates).run();
      const rates = { ...b.fx_rates, [b.base_currency]: 1 };
      db.insert(fxRates)
        .values(Object.entries(rates).map(([currency, rate]) => ({ currency: currency.toUpperCase(), rate })))
        .run();
    });
    return c.json({ ok: true });
  })
  .get('/prefs', (c) => c.json(getPrefs()))
  .put('/prefs', async (c) => c.json(setPrefs(await body(c, prefsInput))))

  // ---------- 备份 ----------
  .get('/backups', (c) => c.json(listBackups(c.get('config').backupDir)))
  .post('/backups', async (c) => c.json(await createBackup(getSqlite(), c.get('config').backupDir, 'manual'), 201))
  .get('/backups/:name', (c) => {
    const name = c.req.param('name');
    if (!isSafeName(name)) throw new HttpError(400, 'error.invalid_filename');
    const file = path.join(c.get('config').backupDir, name);
    if (!fs.existsSync(file)) throw new HttpError(404, 'error.backup_not_found');
    c.header('Content-Type', 'application/vnd.sqlite3');
    c.header('Content-Disposition', `attachment; filename="${name}"`);
    return c.body(fs.readFileSync(file));
  })

  // ---------- 导出 / 导入（JSON） ----------
  .get('/export', (c) => {
    const sqlite = getSqlite();
    const dump: Record<string, unknown> = { app: 'invest-insight', version: 2, exported_at: new Date().toISOString() };
    for (const t of EXPORT_TABLES) dump[t] = sqlite.prepare(`SELECT * FROM ${t}`).all();
    c.header('Content-Disposition', `attachment; filename="invest-insight-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(dump);
  })
  .post('/import', async (c) => {
    const b = await body(c, importSchema);
    const sqlite = getSqlite();
    await createBackup(sqlite, c.get('config').backupDir, 'pre-restore');
    tx(() => {
      for (const t of [...EXPORT_TABLES].reverse()) sqlite.exec(`DELETE FROM ${t}`);
      for (const t of EXPORT_TABLES) {
        const allowed = new Set((sqlite.prepare(`SELECT name FROM pragma_table_info(?)`).all(t) as { name: string }[]).map((x) => x.name));
        for (const row of b[t] as Record<string, unknown>[]) {
          const cols = Object.keys(row).filter((k) => allowed.has(k));
          const values = cols.map((k) => {
            const v = row[k];
            // 兼容旧版导出（金额为数字）
            if (t === 'transactions' && ['quantity', 'price', 'amount', 'fee'].includes(k))
              return toDecimalString(v as string | number | null) ?? (k === 'fee' ? '0' : null);
            return v as string | number | null;
          });
          sqlite.prepare(`INSERT INTO ${t} (${cols.map((k) => `"${k}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...values);
        }
      }
    });
    log.info('已从 JSON 备份导入数据');
    return c.json({ ok: true });
  })
  // ---------- 交易 CSV ----------
  .get('/export/transactions.csv', (c) => {
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="invest-insight-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(exportTransactionsCsv(c.get('locale')));
  })
  .post('/import/csv/preview', async (c) => {
    const b = await body(c, csvImportInput);
    try {
      return c.json(analyzeCsv(b, c.get('locale')).preview);
    } catch (e) {
      if (e instanceof CsvError) throw new HttpError(400, e.key, e.params);
      throw e;
    }
  })
  .post('/import/csv/commit', async (c) => {
    const b = await body(c, csvImportInput);
    try {
      analyzeCsv(b, c.get('locale'));
    } catch (e) {
      if (e instanceof CsvError) throw new HttpError(400, e.key, e.params);
      throw e;
    }
    await createBackup(getSqlite(), c.get('config').backupDir, 'pre-restore');
    const result = commitCsv(b, c.get('locale'));
    log.info(result, '已从 CSV 导入交易');
    return c.json(result);
  })
  .post('/demo', async (c) => {
    await createBackup(getSqlite(), c.get('config').backupDir, 'pre-restore');
    loadDemo(c.get('locale'));
    return c.json({ ok: true });
  })
  .delete('/data', async (c) => {
    await createBackup(getSqlite(), c.get('config').backupDir, 'pre-restore');
    resetAll(c.get('locale'));
    return c.json({ ok: true });
  });
