import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/db/index.js';
import { listBackups } from '../src/db/backup.js';
import { createUser } from '../src/domain/auth.js';
import { createApp } from '../src/http/app.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ii-test-'));
const config = loadConfig({ NODE_ENV: 'test', DATA_DIR: dir, STATIC_DIR: path.join(dir, 'no-web'), BASE_URL: 'http://ii.test' });
let app: ReturnType<typeof createApp>;
let cookie = '';

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`http://ii.test${url}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  await openDatabase({ file: config.dbPath, migrationsDir: config.MIGRATIONS_DIR, backupDir: config.backupDir });
  createUser('Tester', 'correct-horse-battery');
  app = createApp(config);
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('认证与安全', () => {
  it('健康检查无需登录', async () => {
    const r = await req('GET', '/healthz');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok' });
  });

  it('未登录访问 API 返回 401', async () => {
    expect((await req('GET', '/api/summary')).status).toBe(401);
  });

  it('密码错误返回 401', async () => {
    expect((await req('POST', '/api/auth/login', { username: 'tester', password: 'wrong' })).status).toBe(401);
  });

  it('连续 5 次密码错误后锁定，即使密码正确也拒绝', async () => {
    createUser('locked-user', 'correct-horse-battery');
    for (let i = 0; i < 5; i++) {
      expect((await req('POST', '/api/auth/login', { username: 'locked-user', password: `wrong-${i}` })).status).toBe(401);
    }
    expect((await req('POST', '/api/auth/login', { username: 'locked-user', password: 'correct-horse-battery' })).status).toBe(429);
  });

  it('开发模式经 Vite 代理访问时（Host 为前端地址）来源校验通过', async () => {
    const devApp = createApp({ ...config, BASE_URL: undefined });
    const r = await devApp.request('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', host: 'localhost:5173' },
      body: JSON.stringify({ username: 'nobody', password: 'x' }),
    });
    // 能走到账号校验（401）而不是被来源校验拦下（403）
    expect(r.status).toBe(401);
  });

  it('用户名大小写不敏感，登录后下发 HttpOnly Cookie', async () => {
    const r = await req('POST', '/api/auth/login', { username: 'TESTER', password: 'correct-horse-battery' });
    expect(r.status).toBe(200);
    const set = r.headers.get('set-cookie')!;
    expect(set).toMatch(/ii_session=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    cookie = set.split(';')[0];
    expect((await req('GET', '/api/auth/me')).status).toBe(200);
  });

  it('拒绝非 JSON 的写请求（防表单 CSRF）', async () => {
    const r = await app.request('http://ii.test/api/categories', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=x',
    });
    expect(r.status).toBe(415);
  });

  it('拒绝跨站来源', async () => {
    const r = await req('POST', '/api/categories', { name: 'x', color: '#000000' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });

  it('响应带安全头', async () => {
    const r = await req('GET', '/api/summary');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('资产与交易', () => {
  let assetId = 0;

  it('创建资产并录入初始持仓', async () => {
    const cats = (await (await req('GET', '/api/categories')).json()) as { id: number; name: string }[];
    const stock = cats.find((c) => c.name === '股票')!;
    const r = await req('POST', '/api/assets', {
      name: '测试股',
      symbol: '600000',
      category_id: stock.id,
      currency: 'CNY',
      valuation_mode: 'market',
      initial: { date: '2025-01-02', quantity: '0.3', price: '0.1' },
    });
    expect(r.status).toBe(201);
    assetId = ((await r.json()) as { id: number }).id;
  });

  it('多笔小数买入后持仓精确', async () => {
    for (let i = 0; i < 7; i++) {
      const r = await req('POST', '/api/transactions', { asset_id: assetId, type: 'buy', date: '2025-01-03', quantity: 0.1, price: 0.1 });
      expect(r.status).toBe(201);
    }
    const h = (await (await req('GET', `/api/assets/${assetId}`)).json()) as { quantity: number; cost: number };
    expect(h.quantity).toBe(1);
    expect(h.cost).toBe(0.1);
  });

  it('卖出超过持仓被拒绝', async () => {
    const r = await req('POST', '/api/transactions', { asset_id: assetId, type: 'sell', date: '2025-02-01', quantity: 2, price: 1 });
    expect(r.status).toBe(400);
  });

  it('参数校验失败返回可读的错误', async () => {
    const r = await req('POST', '/api/transactions', { asset_id: assetId, type: 'buy', date: '2025/01/01' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/date/);
  });

  it('总览、收益、体检等分析接口可用', async () => {
    for (const url of [
      '/api/summary',
      '/api/performance?period=1Y',
      '/api/income',
      '/api/health',
      '/api/planning',
      '/api/exposure',
      '/api/rebalance?newMoney=1000&mode=buy_only',
      '/api/history',
    ]) {
      expect((await req('GET', url)).status, url).toBe(200);
    }
  });
});

describe('数据管理', () => {
  it('加载示例数据前自动备份', async () => {
    const before = listBackups(config.backupDir).length;
    expect((await req('POST', '/api/demo', {})).status).toBe(200);
    expect(listBackups(config.backupDir).length).toBe(before + 1);
    const s = (await (await req('GET', '/api/summary')).json()) as { holdings: unknown[] };
    expect(s.holdings.length).toBeGreaterThan(10);
  });

  it('导出后再导入，数据一致', async () => {
    const dump = await (await req('GET', '/api/export')).json();
    const s1 = (await (await req('GET', '/api/summary')).json()) as { total_value: number };
    expect((await req('POST', '/api/import', dump)).status).toBe(200);
    const s2 = (await (await req('GET', '/api/summary')).json()) as { total_value: number };
    expect(s2.total_value).toBeCloseTo(s1.total_value, 6);
  });

  it('手动备份可下载，非法文件名被拒绝', async () => {
    const r = await req('POST', '/api/backups', {});
    expect(r.status).toBe(201);
    const { name } = (await r.json()) as { name: string };
    expect((await req('GET', `/api/backups/${name}`)).status).toBe(200);
    expect((await req('GET', `/api/backups/..%2Finvest-insight.db`)).status).toBe(400);
  });
});

describe('多语言', () => {
  it('按 X-Locale 返回英文错误信息', async () => {
    const r = await req('POST', '/api/auth/login', { username: 'nobody', password: 'x' }, { 'x-locale': 'en' });
    expect(((await r.json()) as { error: string }).error).toBe('Incorrect username or password');
  });

  it('未指定时按 Accept-Language 判断', async () => {
    const r = await req('GET', '/api/assets/999999', undefined, { 'accept-language': 'en-US,en;q=0.9' });
    expect(((await r.json()) as { error: string }).error).toBe('Asset not found');
  });

  it('参数校验信息随语言变化', async () => {
    const r = await req('POST', '/api/transactions', { asset_id: 1, type: 'buy', date: '2025/01/01' }, { 'x-locale': 'en' });
    expect(((await r.json()) as { error: string }).error).toContain('date must be YYYY-MM-DD');
  });

  it('英文界面加载的示例数据与体检文案为英文', async () => {
    expect((await req('POST', '/api/demo', {}, { 'x-locale': 'en' })).status).toBe(200);
    const cats = (await (await req('GET', '/api/categories')).json()) as { name: string }[];
    expect(cats.map((c) => c.name)).toContain('Stocks');
    const health = (await (await req('GET', '/api/health', undefined, { 'x-locale': 'en' })).json()) as { results: { group: string }[] };
    expect(health.results.some((r) => r.group === 'Concentration')).toBe(true);
    const zhHealth = (await (await req('GET', '/api/health', undefined, { 'x-locale': 'zh-CN' })).json()) as { results: { group: string }[] };
    expect(zhHealth.results.some((r) => r.group === '集中度')).toBe(true);
  });
});

describe('旧版数据库升级', () => {
  it('识别原型数据库，备份后导入新结构', async () => {
    closeDatabase();
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ii-legacy-'));
    const file = path.join(legacyDir, 'invest-insight.db');
    const old = new Database(file);
    old.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE fx_rates (currency TEXT PRIMARY KEY, rate REAL NOT NULL);
      CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, target_percent REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, symbol TEXT, category_id INTEGER NOT NULL, currency TEXT NOT NULL, valuation_mode TEXT NOT NULL, notes TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id INTEGER NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, quantity REAL, price REAL, amount REAL, fee REAL NOT NULL DEFAULT 0, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login_at TEXT);
      INSERT INTO settings VALUES ('base_currency', 'CNY');
      INSERT INTO fx_rates VALUES ('CNY', 1);
      INSERT INTO categories (name, color) VALUES ('股票', '#2a78d6');
      INSERT INTO assets (name, category_id, currency, valuation_mode) VALUES ('BTC', 1, 'CNY', 'market');
      INSERT INTO transactions (asset_id, type, date, quantity, price, fee) VALUES (1, 'buy', '2025-01-01', 0.00001, 60000.5, 1.25);
      INSERT INTO users (username, password_hash) VALUES ('Admin', 'scrypt$x');
    `);
    old.close();

    const cfg = loadConfig({ NODE_ENV: 'test', DATA_DIR: legacyDir });
    const h = await openDatabase({ file, migrationsDir: cfg.MIGRATIONS_DIR, backupDir: cfg.backupDir });
    const row = h.sqlite.prepare('SELECT quantity, price, fee FROM transactions').get();
    expect(row).toEqual({ quantity: '0.00001', price: '60000.5', fee: '1.25' });
    expect(h.sqlite.prepare('SELECT username FROM users').get()).toEqual({ username: 'admin' });
    expect(listBackups(cfg.backupDir).some((b) => b.kind === 'legacy')).toBe(true);
    closeDatabase();
    fs.rmSync(legacyDir, { recursive: true, force: true });
  });
});
