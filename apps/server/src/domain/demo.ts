import { getDb, getSqlite, tx } from '../db/index.js';
import type { Locale } from '../i18n.js';
import { seedDefaults } from '../db/seed.js';
import { toDecimalString } from './ledger.js';
import { toDateStr } from './portfolio.js';
import { setPrefs } from './prefs.js';

const BUSINESS_TABLES = ['goals', 'asset_components', 'transactions', 'assets', 'accounts', 'categories', 'fx_rates', 'settings'];

/** 清空所有业务数据（保留账号与会话），然后恢复默认类别与汇率 */
export function resetAll(locale: Locale = 'zh-CN') {
  const sqlite = getSqlite();
  tx(() => {
    for (const t of BUSINESS_TABLES) sqlite.exec(`DELETE FROM ${t}`);
    sqlite.exec(`DELETE FROM sqlite_sequence WHERE name IN (${BUSINESS_TABLES.map((t) => `'${t}'`).join(',')})`);
  });
  seedDefaults(getDb(), locale);
}

// 示例数据的英文名称（示例内容以中文书写，英文界面加载时按此替换）
const EN: Record<string, string> = {
  贵州茅台: 'Kweichow Moutai',
  宁德时代: 'CATL',
  中国平安: 'Ping An Insurance',
  招商银行: 'China Merchants Bank',
  美的集团: 'Midea Group',
  紫金矿业: 'Zijin Mining',
  长江电力: 'China Yangtze Power',
  兴业银行: 'Industrial Bank',
  五粮液: 'Wuliangye',
  比亚迪: 'BYD',
  腾讯控股: 'Tencent',
  小米集团: 'Xiaomi',
  阿里巴巴: 'Alibaba',
  美团: 'Meituan',
  中芯国际: 'SMIC',
  京东集团: 'JD.com',
  快手: 'Kuaishou',
  网易: 'NetEase',
  百度集团: 'Baidu',
  理想汽车: 'Li Auto',
  伊利股份: 'Yili',
  泸州老窖: 'Luzhou Laojiao',
  格力电器: 'Gree Electric',
  山西汾酒: 'Shanxi Fenjiu',
  海尔智家: 'Haier Smart Home',
  牧原股份: 'Muyuan Foods',
  海天味业: 'Haitian Flavouring',
  日常消费: 'Consumer Staples',
  工业: 'Industrials',
  金融: 'Financials',
  可选消费: 'Consumer Discretionary',
  原材料: 'Materials',
  公用事业: 'Utilities',
  信息技术: 'Information Technology',
  通信服务: 'Communication Services',
  国债: 'Treasuries',
  加密货币: 'Crypto',
  股票: 'Stocks',
  基金: 'Funds',
  债券: 'Bonds',
  保险: 'Insurance',
  现金: 'Cash',
  沪深300ETF: 'CSI 300 ETF',
  标普500指数基金: 'S&P 500 Index Fund',
  十年期国债: '10-Year Treasury Bond',
  '年金险（20 年缴）': 'Annuity (20-year premiums)',
  重疾险: 'Critical Illness Insurance',
  货币基金: 'Money Market Fund',
  美元存款: 'USD Deposit',
  恒生科技ETF: 'Hang Seng Tech ETF',
  消费ETF: 'Consumer ETF',
  现金价值按保单年度报告更新: 'Cash value updated from the annual policy statement',
  '保障型，现金价值较低': 'Protection-focused; low cash value',
  招商证券: 'China Merchants Securities',
  富途证券: 'Futu Securities',
  支付宝: 'Alipay',
  平安保险: 'Ping An Insurance Co.',
  加密货币交易所: 'Crypto Exchange',
  建仓: 'Initial position',
  首次存入: 'Initial deposit',
  定投: 'Regular investment',
  续期缴费: 'Renewal premium',
  '年度分红/利息': 'Annual dividend / interest',
  部分止盈: 'Partial profit-taking',
  清仓: 'Closed position',
  购房首付: 'Home down payment',
  子女教育金: "Children's education fund",
  '总资产 500 万': 'Net worth 5M',
  现金类资产专款专用: 'Cash assets reserved for this goal',
};
let lang: Locale = 'zh-CN';
const L = <T extends string | null | undefined>(s: T): T => (lang === 'en' && s ? ((EN[s] ?? s) as T) : s);

const d = (n: number | null | undefined) => toDecimalString(n ?? null);

// 可复现的伪随机数
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface DemoAsset {
  name: string;
  symbol?: string;
  category: string;
  currency: string;
  mode: 'market' | 'manual';
  notes?: string;
  sector?: string;
  account: string;
  /** 基金成分：[代码, 名称, 权重%, 行业] */
  components?: [string, string, number, string][];
  /** market：初始价格；manual：首次存入金额 */
  start: number;
  /** 初始数量（market） */
  qty?: number;
  /** 月度漂移与波动 */
  drift: number;
  vol: number;
  /** 每 N 个月追加一次买入/存入 */
  addEvery?: number;
  addQty?: number;
  addAmount?: number;
  /** 每 12 个月一次分红/利息（占价值比例） */
  yieldRate?: number;
}

// 示例成分与权重仅为演示用的近似值，不代表真实披露数据
const CSI300: [string, string, number, string][] = [
  ['600519.SH', '贵州茅台', 4.6, '日常消费'],
  ['300750.SZ', '宁德时代', 3.2, '工业'],
  ['601318.SH', '中国平安', 2.6, '金融'],
  ['600036.SH', '招商银行', 2.5, '金融'],
  ['000333.SZ', '美的集团', 1.9, '可选消费'],
  ['601899.SH', '紫金矿业', 1.8, '原材料'],
  ['600900.SH', '长江电力', 1.7, '公用事业'],
  ['601166.SH', '兴业银行', 1.4, '金融'],
  ['000858.SZ', '五粮液', 1.2, '日常消费'],
  ['002594.SZ', '比亚迪', 1.2, '可选消费'],
];
const SP500: [string, string, number, string][] = [
  ['NVDA', 'NVIDIA', 7.5, '信息技术'],
  ['MSFT', 'Microsoft', 6.5, '信息技术'],
  ['AAPL', 'Apple', 6.0, '信息技术'],
  ['AMZN', 'Amazon', 3.8, '可选消费'],
  ['META', 'Meta Platforms', 2.8, '通信服务'],
  ['AVGO', 'Broadcom', 2.4, '信息技术'],
  ['GOOGL', 'Alphabet A', 2.0, '通信服务'],
  ['TSLA', 'Tesla', 1.8, '可选消费'],
  ['GOOG', 'Alphabet C', 1.7, '通信服务'],
  ['BRK.B', 'Berkshire Hathaway', 1.6, '金融'],
];
const HSTECH: [string, string, number, string][] = [
  ['0700.HK', '腾讯控股', 8.2, '通信服务'],
  ['1810.HK', '小米集团', 8.0, '信息技术'],
  ['9988.HK', '阿里巴巴', 7.9, '可选消费'],
  ['3690.HK', '美团', 7.4, '可选消费'],
  ['0981.HK', '中芯国际', 6.1, '信息技术'],
  ['9618.HK', '京东集团', 5.0, '可选消费'],
  ['1024.HK', '快手', 4.5, '通信服务'],
  ['9999.HK', '网易', 4.0, '通信服务'],
  ['9888.HK', '百度集团', 3.5, '通信服务'],
  ['2015.HK', '理想汽车', 3.0, '可选消费'],
];
const CONSUMER: [string, string, number, string][] = [
  ['SH600519', '贵州茅台', 10.5, '日常消费'],
  ['SZ000858', '五粮液', 9.8, '日常消费'],
  ['SH600887', '伊利股份', 8.6, '日常消费'],
  ['SZ000333', '美的集团', 7.9, '可选消费'],
  ['SZ000568', '泸州老窖', 5.2, '日常消费'],
  ['SZ000651', '格力电器', 4.8, '可选消费'],
  ['SH600809', '山西汾酒', 4.5, '日常消费'],
  ['SH600690', '海尔智家', 4.1, '可选消费'],
  ['SZ002714', '牧原股份', 3.6, '日常消费'],
  ['SH603288', '海天味业', 3.0, '日常消费'],
];

const DEMO: DemoAsset[] = [
  {
    name: '中国平安',
    account: '招商证券',
    symbol: '601318',
    sector: '金融',
    category: '股票',
    currency: 'CNY',
    mode: 'market',
    start: 42,
    qty: 2000,
    drift: 0.006,
    vol: 0.04,
  },
  {
    name: '贵州茅台',
    account: '招商证券',
    symbol: '600519',
    sector: '日常消费',
    category: '股票',
    currency: 'CNY',
    mode: 'market',
    start: 1650,
    qty: 100,
    drift: 0.004,
    vol: 0.06,
    yieldRate: 0.015,
  },
  {
    name: '腾讯控股',
    account: '富途证券',
    symbol: '00700',
    sector: '通信服务',
    category: '股票',
    currency: 'HKD',
    mode: 'market',
    start: 320,
    qty: 800,
    drift: 0.012,
    vol: 0.08,
    addEvery: 4,
    addQty: 100,
  },
  {
    name: 'Apple',
    account: '富途证券',
    symbol: 'AAPL',
    sector: '信息技术',
    category: '股票',
    currency: 'USD',
    mode: 'market',
    start: 185,
    qty: 200,
    drift: 0.01,
    vol: 0.06,
  },
  {
    name: '沪深300ETF',
    account: '招商证券',
    symbol: '510300',
    category: '基金',
    currency: 'CNY',
    mode: 'market',
    start: 3.6,
    qty: 30000,
    drift: 0.006,
    vol: 0.04,
    addEvery: 1,
    addQty: 2000,
    components: CSI300,
  },
  {
    name: '标普500指数基金',
    account: '支付宝',
    symbol: '050025',
    category: '基金',
    currency: 'CNY',
    mode: 'market',
    start: 4.8,
    qty: 15000,
    drift: 0.011,
    vol: 0.035,
    addEvery: 2,
    addQty: 1000,
    components: SP500,
  },
  {
    name: '十年期国债',
    account: '招商证券',
    symbol: '019740',
    sector: '国债',
    category: '债券',
    currency: 'CNY',
    mode: 'market',
    start: 101.2,
    qty: 1500,
    drift: 0.002,
    vol: 0.006,
    yieldRate: 0.024,
  },
  {
    name: '年金险（20 年缴）',
    account: '平安保险',
    category: '保险',
    currency: 'CNY',
    mode: 'manual',
    start: 50000,
    drift: 0.003,
    vol: 0,
    addEvery: 12,
    addAmount: 50000,
    notes: '现金价值按保单年度报告更新',
  },
  {
    name: '重疾险',
    account: '平安保险',
    category: '保险',
    currency: 'CNY',
    mode: 'manual',
    start: 8600,
    drift: 0.001,
    vol: 0,
    addEvery: 12,
    addAmount: 8600,
    notes: '保障型，现金价值较低',
  },
  {
    name: 'Bitcoin',
    account: '加密货币交易所',
    symbol: 'BTC',
    sector: '加密货币',
    category: '加密货币',
    currency: 'USD',
    mode: 'market',
    start: 58000,
    qty: 0.8,
    drift: 0.025,
    vol: 0.14,
  },
  {
    name: 'Ethereum',
    account: '加密货币交易所',
    symbol: 'ETH',
    sector: '加密货币',
    category: '加密货币',
    currency: 'USD',
    mode: 'market',
    start: 3100,
    qty: 6,
    drift: 0.01,
    vol: 0.16,
  },
  { name: '货币基金', account: '支付宝', category: '现金', currency: 'CNY', mode: 'manual', start: 180000, drift: 0.0016, vol: 0, yieldRate: 0 },
  { name: '美元存款', account: '招商银行', category: '现金', currency: 'USD', mode: 'manual', start: 12000, drift: 0.0035, vol: 0 },
  {
    name: '恒生科技ETF',
    account: '招商证券',
    symbol: '513180',
    category: '基金',
    currency: 'CNY',
    mode: 'market',
    start: 0.62,
    qty: 150000,
    drift: 0.008,
    vol: 0.07,
    addEvery: 3,
    addQty: 20000,
    components: HSTECH,
  },
  {
    name: '消费ETF',
    account: '招商证券',
    symbol: '159928',
    category: '基金',
    currency: 'CNY',
    mode: 'market',
    start: 0.86,
    qty: 120000,
    drift: 0.003,
    vol: 0.05,
    addEvery: 6,
    addQty: 20000,
    components: CONSUMER,
  },
];

const MONTHS = 18;

const DEMO_ACCOUNTS: [string, string][] = [
  ['招商证券', 'broker'],
  ['富途证券', 'broker'],
  ['支付宝', 'fund'],
  ['平安保险', 'insurance'],
  ['加密货币交易所', 'exchange'],
  ['招商银行', 'bank'],
];

export function loadDemo(locale: Locale = 'zh-CN') {
  lang = locale;
  resetAll(locale);
  const db = getSqlite();
  const cats = new Map((db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map((c) => [c.name, c.id]));
  const insAcc = db.prepare('INSERT INTO accounts (name, type, sort_order) VALUES (?, ?, ?)');
  const accounts = new Map(DEMO_ACCOUNTS.map(([name, type], i) => [name, Number(insAcc.run(L(name), type, i).lastInsertRowid)]));
  const insAsset = db.prepare(
    'INSERT INTO assets (name, symbol, category_id, currency, valuation_mode, notes, sector, components_as_of, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insComp = db.prepare('INSERT INTO asset_components (asset_id, symbol, name, weight, sector, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const insTxRaw = db.prepare(
    'INSERT INTO transactions (asset_id, type, date, quantity, price, amount, fee, fx_rate, fx_base, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // 示例的历史汇率：外币相对当前汇率由低到高缓慢变化（约 4%），用于展示价格 / 汇率收益拆分
  const base = (db.prepare("SELECT value FROM settings WHERE key = 'base_currency'").get() as { value: string }).value;
  const rates = Object.fromEntries(
    (db.prepare('SELECT currency, rate FROM fx_rates').all() as { currency: string; rate: number }[]).map((r) => [r.currency, r.rate]),
  );
  const currencyOf = new Map<number, string>();
  const fxOn = (currency: string, date: string) => {
    if (currency === base) return '1';
    const monthsAgo = (now.getTime() - new Date(date + 'T00:00:00').getTime()) / (30.4 * 86400000);
    const factor = 1 - 0.04 * Math.min(1, monthsAgo / MONTHS) + 0.006 * Math.sin(monthsAgo * 1.7);
    return toDecimalString(Math.round((rates[currency] ?? 1) * factor * 10000) / 10000);
  };
  const insTx = (id: number, type: string, date: string, q: number | null, p: number | null, amt: number | null, fee: number, note: string | null) =>
    insTxRaw.run(id, type, date, d(q), d(p), d(amt), d(fee), fxOn(currencyOf.get(id)!, date), base, note);
  const now = new Date();
  const monthDate = (offset: number, day = 15) => {
    const d = new Date(now.getFullYear(), now.getMonth() - MONTHS + offset, day);
    return d > now ? toDateStr(now) : toDateStr(d);
  };

  tx(() => {
    DEMO.forEach((a, idx) => {
      const rand = rng(idx * 97 + 13);
      const { lastInsertRowid } = insAsset.run(
        L(a.name),
        a.symbol ?? null,
        cats.get(L(a.category))!,
        a.currency,
        a.mode,
        L(a.notes) ?? null,
        L(a.sector) ?? null,
        a.components ? monthDate(MONTHS - 1, 30) : null,
        accounts.get(a.account) ?? null,
      );
      const id = Number(lastInsertRowid);
      currencyOf.set(id, a.currency);
      a.components?.forEach(([sym, name, w, sector], i) => insComp.run(id, sym, L(name), w, L(sector), i));
      let price = a.start;
      let value = a.start;

      if (a.mode === 'market') {
        insTx(id, 'buy', monthDate(0, 3), a.qty!, price, null, round(price * a.qty! * 0.0003), L('建仓'));
      } else {
        insTx(id, 'deposit', monthDate(0, 3), null, null, a.start, 0, L('首次存入'));
      }

      for (let m = 1; m <= MONTHS; m++) {
        const shock = (rand() - 0.5) * 2 * a.vol;
        price = price * (1 + a.drift + shock);
        value = value * (1 + a.drift);
        const date = monthDate(m, 28);

        if (a.mode === 'market') {
          if (a.addEvery && m % a.addEvery === 0 && m < MONTHS) {
            insTx(id, 'buy', monthDate(m, 10), a.addQty!, round(price), null, 5, L('定投'));
          }
          insTx(id, 'valuation', date, null, round(price), null, 0, null);
        } else {
          if (a.addEvery && m % a.addEvery === 0) {
            insTx(id, 'deposit', monthDate(m, 3), null, null, a.addAmount!, 0, L('续期缴费'));
            value += a.addAmount!;
          }
          insTx(id, 'valuation', date, null, null, round(value), 0, null);
        }

        if (a.yieldRate && m % 12 === 6) {
          const base = a.mode === 'market' ? price * (a.qty ?? 0) : value;
          insTx(id, 'income', monthDate(m, 20), null, null, round(base * a.yieldRate), 0, L('年度分红/利息'));
        }
      }

      // 部分止盈，展示已实现收益
      if (a.symbol === 'BTC') {
        insTx(id, 'sell', monthDate(MONTHS - 3, 12), 0.2, round(price * 0.97), null, 15, L('部分止盈'));
      }
      if (a.symbol === '601318') {
        insTx(id, 'sell', monthDate(12, 18), a.qty!, round(a.start * 1.16), null, 25, L('清仓'));
      }
    });
  });
  seedGoals();
}

function seedGoals() {
  const db = getSqlite();
  const now = new Date();
  const ins = db.prepare(
    'INSERT INTO goals (name, target_amount, target_date, monthly_contribution, expected_return, scope_type, scope_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const cash = db.prepare('SELECT id FROM categories WHERE name = ?').get(L('现金')) as { id: number } | undefined;
  const alipay = db.prepare('SELECT id FROM accounts WHERE name = ?').get(L('支付宝')) as { id: number } | undefined;
  ins.run(L('购房首付'), 1000000, toDateStr(new Date(now.getFullYear() + 2, 5, 1)), 20000, 2, 'category', cash?.id ?? null, L('现金类资产专款专用'));
  ins.run(L('子女教育金'), 800000, toDateStr(new Date(now.getFullYear() + 8, 8, 1)), 3000, 5, 'account', alipay?.id ?? null, null);
  ins.run(L('总资产 500 万'), 5000000, toDateStr(new Date(now.getFullYear() + 10, 0, 1)), 15000, 6, 'portfolio', null, null);
  setPrefs({ monthly_expense: 15000, fire_monthly_saving: 20000 });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
