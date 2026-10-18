import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { closeDatabase, getSqlite, openDatabase } from '../src/db/index.js';
import { createUser } from '../src/domain/auth.js';
import { parseCsv, toCsv } from '../src/domain/csv.js';
import { applyTx, emptyState } from '../src/domain/ledger.js';
import { createApp } from '../src/http/app.js';

describe('成交汇率与收益拆分（账本）', () => {
  it('成本按成交汇率折算，卖出按比例结转基准币种成本', () => {
    const s = emptyState();
    // 7.0 时买入 10 股 @100 USD，7.2 时再买 10 股 @110 USD
    applyTx(s, 'market', { type: 'buy', date: '2025-01-01', quantity: '10', price: '100', amount: null, fee: '0' }, '7.0');
    applyTx(s, 'market', { type: 'buy', date: '2025-02-01', quantity: '10', price: '110', amount: null, fee: '0' }, '7.2');
    expect(s.cost.toString()).toBe('2100');
    expect(s.costBase.toString()).toBe('14920');
    // 7.3 时卖出一半 @120：结转一半成本，已实现 = 600×7.3 − 7460
    applyTx(s, 'market', { type: 'sell', date: '2025-03-01', quantity: '10', price: '120', amount: null, fee: '0' }, '7.3');
    expect(s.costBase.toString()).toBe('7460');
    expect(s.realizedBase.toString()).toBe('1300');
    expect(s.realized.toString()).toBe('150');
  });

  it('价格收益 + 汇率收益 = 浮动盈亏', () => {
    const s = emptyState();
    applyTx(s, 'market', { type: 'buy', date: '2025-01-01', quantity: '10', price: '100', amount: null, fee: '0' }, '7.0');
    applyTx(s, 'market', { type: 'valuation', date: '2025-06-01', quantity: null, price: '120', amount: null, fee: '0' }, '7.1');
    const fxNow = 7.2;
    const value = s.value.toNumber();
    const cost = s.cost.toNumber();
    const unrealized = value * fxNow - s.costBase.toNumber();
    const pricePnl = (value - cost) * fxNow;
    const fxPnl = cost * fxNow - s.costBase.toNumber();
    expect(pricePnl).toBeCloseTo(1440, 6);
    expect(fxPnl).toBeCloseTo(200, 6);
    expect(pricePnl + fxPnl).toBeCloseTo(unrealized, 6);
  });
});

describe('CSV 读写', () => {
  it('解析引号、转义引号、字段内换行和 BOM', () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","he said ""hi"""\n2,"line1\nline2",\n\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'he said "hi"'],
      ['2', 'line1\nline2', ''],
    ]);
  });

  it('自动识别分号与制表符分隔', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });

  it('写出时防止公式注入，但保留负数', () => {
    const out = toCsv(['x'], [['=SUM(A1)'], ['-12.5'], ['@cmd'], ['a,b']]);
    expect(out).toContain("'=SUM(A1)");
    expect(out).toContain('\r\n-12.5\r\n');
    expect(out).toContain("'@cmd");
    expect(out).toContain('"a,b"');
  });
});

describe('成交汇率与 CSV 导入（接口）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ii-fxcsv-'));
  const config = loadConfig({ NODE_ENV: 'test', DATA_DIR: dir, STATIC_DIR: path.join(dir, 'none'), BASE_URL: 'http://ii.test' });
  let app: ReturnType<typeof createApp>;
  let cookie = '';
  let stockCat = 0;
  const req = (method: string, url: string, body?: unknown) =>
    app.request(`http://ii.test${url}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  beforeAll(async () => {
    await openDatabase({ file: config.dbPath, migrationsDir: config.MIGRATIONS_DIR, backupDir: config.backupDir });
    createUser('tester', 'correct-horse-battery');
    app = createApp(config);
    const r = await req('POST', '/api/auth/login', { username: 'tester', password: 'correct-horse-battery' });
    cookie = r.headers.get('set-cookie')!.split(';')[0];
    stockCat = ((await (await req('GET', '/api/categories')).json()) as { id: number; name: string }[]).find((c) => c.name === '股票')!.id;
  });
  afterAll(() => {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('外币交易未填汇率时记录当前汇率，本币交易汇率为 1', async () => {
    const { id } = (await (
      await req('POST', '/api/assets', { name: 'Apple', symbol: 'AAPL', category_id: stockCat, currency: 'USD', valuation_mode: 'market' })
    ).json()) as { id: number };
    await req('POST', '/api/transactions', { asset_id: id, type: 'buy', date: '2025-01-02', quantity: '10', price: '100', fx_rate: '7.0' });
    await req('POST', '/api/transactions', { asset_id: id, type: 'buy', date: '2025-02-02', quantity: '10', price: '100' });
    const rows = getSqlite().prepare('SELECT fx_rate, fx_base FROM transactions ORDER BY id').all();
    expect(rows).toEqual([
      { fx_rate: '7', fx_base: 'CNY' },
      { fx_rate: '7.12', fx_base: 'CNY' },
    ]);
    const h = (await (await req('GET', `/api/assets/${id}`)).json()) as {
      cost_base: number;
      price_pnl_base: number;
      fx_pnl_base: number;
      unrealized_base: number;
    };
    expect(h.cost_base).toBeCloseTo(14120, 6);
    expect(h.price_pnl_base + h.fx_pnl_base).toBeCloseTo(h.unrealized_base, 6);
    expect(h.fx_pnl_base).toBeCloseTo(2000 * 7.12 - 14120, 6);
  });

  it('编辑交易未提供汇率时保留原成交汇率', async () => {
    const tx = getSqlite().prepare('SELECT id, asset_id FROM transactions ORDER BY id LIMIT 1').get() as { id: number; asset_id: number };
    await req('PUT', `/api/transactions/${tx.id}`, { asset_id: tx.asset_id, type: 'buy', date: '2025-01-03', quantity: '10', price: '101' });
    expect(getSqlite().prepare('SELECT fx_rate FROM transactions WHERE id = ?').get(tx.id)).toEqual({ fx_rate: '7' });
  });

  it('CSV 预览：中文表头、重复、超卖、未知资产、新建资产', async () => {
    const csv = [
      '日期,类型,资产,代码,账户,币种,数量,价格,金额,手续费,成交汇率,备注',
      '2025-01-03,买入,Apple,AAPL,,USD,10,101,,,7,重复行',
      '2025-03-01,卖出,Apple,AAPL,,,25,120,,,7.2,超卖',
      '2025-03-02,卖出,Apple,AAPL,,,5,120,,,7.2,正常卖出',
      '2025-03-05,买入,Nvidia,NVDA,盈透证券,USD,2,"1,000.5",,,7.1,新资产',
      '2025/3/6,分红/利息,Apple,AAPL,,,,,3.2,,7.2,日期用斜杠',
      '2025-02-30,买入,Apple,AAPL,,,1,1,,,,无效日期',
    ].join('\n');
    const p = (await (await req('POST', '/api/import/csv/preview', { csv, create_missing: true, default_category_id: stockCat })).json()) as {
      rows: { line: number; status: string; message: string | null; price: string | null; date: string | null }[];
      counts: { ok: number; duplicate: number; error: number };
      new_assets: { name: string; valuation_mode: string; account: string | null }[];
      new_accounts: string[];
    };
    expect(p.counts).toEqual({ ok: 3, duplicate: 1, error: 2 });
    expect(p.rows.find((r) => r.line === 2)!.status).toBe('duplicate');
    expect(p.rows.find((r) => r.line === 3)!.status).toBe('error');
    expect(p.rows.find((r) => r.line === 5)!.price).toBe('1000.5');
    expect(p.rows.find((r) => r.line === 6)!.date).toBe('2025-03-06');
    expect(p.new_assets).toEqual([{ name: 'Nvidia', symbol: 'NVDA', currency: 'USD', category: '股票', account: '盈透证券', valuation_mode: 'market' }]);
    expect(p.new_accounts).toEqual(['盈透证券']);

    const before = getSqlite().prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number };
    const r = (await (await req('POST', '/api/import/csv/commit', { csv, create_missing: true, default_category_id: stockCat })).json()) as {
      imported: number;
      created_assets: number;
    };
    expect(r).toMatchObject({ imported: 3, created_assets: 1 });
    expect((getSqlite().prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n).toBe(before.n + 3);
    // 再次导入同一文件：全部识别为重复或错误，不会重复写入
    const again = (await (await req('POST', '/api/import/csv/preview', { csv, create_missing: true })).json()) as { counts: { ok: number } };
    expect(again.counts.ok).toBe(0);
  });

  it('导出的 CSV 可以原样导入（全部识别为重复）', async () => {
    const res = await req('GET', '/api/export/transactions.csv?locale=en');
    // 原始字节带 BOM（Excel 打开中文不乱码）；Response.text() 会去掉 BOM
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const exported = await res.text();
    expect(exported.startsWith('date,type,asset')).toBe(true);
    const p = (await (await req('POST', '/api/import/csv/preview', { csv: exported, create_missing: false })).json()) as {
      counts: { ok: number; duplicate: number; error: number };
    };
    expect(p.counts.ok).toBe(0);
    expect(p.counts.error).toBe(0);
    expect(p.counts.duplicate).toBeGreaterThan(0);
  });

  it('缺少必需列时返回明确错误', async () => {
    const r = await req('POST', '/api/import/csv/preview', { csv: 'foo,bar\n1,2' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain('日期');
  });
});

describe('迁移：已有交易补齐汇率字段', () => {
  it('本币交易补 1，外币交易留空并计为估算', async () => {
    closeDatabase();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ii-mig-'));
    const cfg = loadConfig({ NODE_ENV: 'test', DATA_DIR: dir });
    // 先只执行第一个迁移，模拟旧版本数据库
    const migOld = path.join(dir, 'mig-old');
    fs.mkdirSync(path.join(migOld, 'meta'), { recursive: true });
    fs.copyFileSync(path.join(cfg.MIGRATIONS_DIR, '0000_init.sql'), path.join(migOld, '0000_init.sql'));
    const journal = JSON.parse(fs.readFileSync(path.join(cfg.MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'));
    journal.entries = journal.entries.slice(0, 1);
    fs.writeFileSync(path.join(migOld, 'meta', '_journal.json'), JSON.stringify(journal));
    const h = await openDatabase({ file: cfg.dbPath, migrationsDir: migOld, backupDir: cfg.backupDir });
    h.sqlite.exec(`
      INSERT INTO assets (name, category_id, currency, valuation_mode) VALUES ('本币', 1, 'CNY', 'market'), ('外币', 1, 'USD', 'market');
      INSERT INTO transactions (asset_id, type, date, quantity, price) VALUES (1, 'buy', '2025-01-01', '1', '10'), (2, 'buy', '2025-01-01', '1', '10');
    `);
    closeDatabase();
    // 用完整迁移重新打开：执行 0001 前会自动备份
    const h2 = await openDatabase({ file: cfg.dbPath, migrationsDir: cfg.MIGRATIONS_DIR, backupDir: cfg.backupDir });
    expect(h2.sqlite.prepare('SELECT fx_rate, fx_base FROM transactions ORDER BY id').all()).toEqual([
      { fx_rate: '1', fx_base: 'CNY' },
      { fx_rate: null, fx_base: 'CNY' },
    ]);
    expect(fs.readdirSync(cfg.backupDir).some((f) => f.includes('pre-migration'))).toBe(true);
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
