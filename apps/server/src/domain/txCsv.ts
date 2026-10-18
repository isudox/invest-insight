import { asc } from 'drizzle-orm';
import type { CsvImportInput, CsvImportPreview, CsvImportResult, CsvImportRow, TxType, ValuationMode } from '@invest-insight/shared';
import { TX_TYPES } from '@invest-insight/shared';
import { getDb, tx as dbTx } from '../db/index.js';
import { accounts, assets, transactions, type AssetRow } from '../db/schema.js';
import { translate, type Locale, type MessageKey, type Params } from '../i18n.js';
import { parseCsv, toCsv } from './csv.js';
import { normalizeSymbol } from './exposure.js';
import { fxForNewTx } from './fx.js';
import { Decimal, toDecimalString } from './ledger.js';
import { allTransactions, listCategories } from './portfolio.js';
import { getBaseCurrency } from './prefs.js';

/**
 * 交易流水的 CSV 导出与导入。
 * 导入分两步：预览（不写库，逐行给出校验结果）→ 确认（重新校验后在一个事务中写入）。
 * 表头与交易类型同时接受中英文，便于直接导入导出文件或券商对账单整理后的表格。
 */

export class CsvError extends Error {
  constructor(
    public key: MessageKey,
    public params: Params = {},
  ) {
    super(key);
  }
}

const FIELDS = ['date', 'type', 'asset', 'symbol', 'account', 'category', 'currency', 'quantity', 'price', 'amount', 'fee', 'fx_rate', 'note'] as const;
type Field = (typeof FIELDS)[number];

const HEADER_LABELS: Record<Locale, Record<Field, string>> = {
  'zh-CN': {
    date: '日期',
    type: '类型',
    asset: '资产',
    symbol: '代码',
    account: '账户',
    category: '类别',
    currency: '币种',
    quantity: '数量',
    price: '价格',
    amount: '金额',
    fee: '手续费',
    fx_rate: '成交汇率',
    note: '备注',
  },
  en: {
    date: 'date',
    type: 'type',
    asset: 'asset',
    symbol: 'symbol',
    account: 'account',
    category: 'category',
    currency: 'currency',
    quantity: 'quantity',
    price: 'price',
    amount: 'amount',
    fee: 'fee',
    fx_rate: 'fx_rate',
    note: 'note',
  },
};

const HEADER_ALIASES: Record<Field, string[]> = {
  date: ['date', 'tradedate', '日期', '交易日期', '成交日期'],
  type: ['type', 'kind', 'action', '类型', '交易类型'],
  asset: ['asset', 'name', 'assetname', '资产', '名称', '资产名称'],
  symbol: ['symbol', 'ticker', 'code', '代码', '证券代码'],
  account: ['account', '账户'],
  category: ['category', '类别', '资产类别'],
  currency: ['currency', 'ccy', '币种'],
  quantity: ['quantity', 'qty', 'shares', 'units', '数量', '份额'],
  price: ['price', 'unitprice', '价格', '成交价', '单价'],
  amount: ['amount', 'value', '金额', '估值'],
  fee: ['fee', 'fees', 'commission', '手续费', '费用'],
  fx_rate: ['fx_rate', 'fx', 'fxrate', 'exchangerate', 'rate', '汇率', '成交汇率'],
  note: ['note', 'notes', 'memo', 'comment', '备注'],
};

const TYPE_ALIASES: Record<TxType, string[]> = {
  buy: ['buy', '买入', '买'],
  sell: ['sell', '卖出', '卖'],
  deposit: ['deposit', 'premium', 'contribution', '存入', '缴费', '存入/缴费', '投入'],
  withdraw: ['withdraw', 'withdrawal', 'redeem', 'redemption', '取出', '赎回', '取出/赎回'],
  income: ['income', 'dividend', 'interest', '分红', '利息', '分红/利息', '收入'],
  valuation: ['valuation', 'price update', 'value', '估值', '更新估值'],
};

const TYPE_LABELS: Record<Locale, Record<TxType, string>> = {
  'zh-CN': { buy: '买入', sell: '卖出', deposit: '存入/缴费', withdraw: '取出/赎回', income: '分红/利息', valuation: '更新估值' },
  en: { buy: 'buy', sell: 'sell', deposit: 'deposit', withdraw: 'withdraw', income: 'income', valuation: 'valuation' },
};

const MARKET_TYPES: TxType[] = ['buy', 'sell', 'valuation', 'income'];
const MANUAL_TYPES: TxType[] = ['deposit', 'withdraw', 'valuation', 'income'];
const MAX_ROWS = 5000;

const normHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）]/g, '');
const lower = (s: string) => s.trim().toLowerCase();

// ---------- 导出 ----------

export function exportTransactionsCsv(locale: Locale): string {
  const db = getDb();
  const assetRows = new Map(
    db
      .select()
      .from(assets)
      .all()
      .map((a) => [a.id, a]),
  );
  const accountNames = new Map(
    db
      .select()
      .from(accounts)
      .all()
      .map((a) => [a.id, a.name]),
  );
  const categoryNames = new Map(listCategories().map((c) => [c.id, c.name]));
  const header = FIELDS.map((f) => HEADER_LABELS[locale][f]);
  const rows = allTransactions().map((t) => {
    const a = assetRows.get(t.asset_id)!;
    return [
      t.date,
      TYPE_LABELS[locale][t.type],
      a.name,
      a.symbol,
      a.account_id ? (accountNames.get(a.account_id) ?? '') : '',
      categoryNames.get(a.category_id) ?? '',
      a.currency,
      t.quantity,
      t.price,
      t.amount,
      t.fee === '0' ? '' : t.fee,
      a.currency === t.fx_base ? '' : t.fx_rate,
      t.note,
    ];
  });
  return toCsv(header, rows);
}

// ---------- 导入：解析与校验 ----------

interface PlannedAsset {
  key: string;
  name: string;
  symbol: string | null;
  currency: string;
  category_id: number;
  category: string;
  account: string | null;
  valuation_mode: ValuationMode;
}

interface Plan {
  preview: CsvImportPreview;
  /** 待写入的行（status=ok），附带资产引用 */
  inserts: { row: CsvImportRow; assetRef: number | string }[];
  newAssets: Map<string, PlannedAsset>;
  newAccounts: string[];
}

function parseDecimal(raw: string | undefined): string | null | 'invalid' {
  if (raw === undefined) return null;
  const s = raw.trim().replace(/[,\s]/g, '');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return 'invalid';
  return toDecimalString(s);
}

function parseDate(raw: string | undefined): string | null {
  const m = raw?.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseType(raw: string | undefined): TxType | null {
  const v = lower(raw ?? '');
  for (const t of TX_TYPES) if (TYPE_ALIASES[t].some((a) => a.toLowerCase() === v)) return t;
  return null;
}

const sameDecimal = (a: string | null, b: string | null) => (a === null || b === null ? a === b : new Decimal(a).eq(b));

export function analyzeCsv(input: CsvImportInput, locale: Locale): Plan {
  const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
  const table = parseCsv(input.csv);
  if (table.length < 2) throw new CsvError('error.csv_empty');
  if (table.length - 1 > MAX_ROWS) throw new CsvError('error.csv_too_many', { max: MAX_ROWS });

  // 表头映射
  const colOf = new Map<Field, number>();
  table[0].forEach((h, i) => {
    const key = normHeader(h);
    const field = FIELDS.find((f) => HEADER_ALIASES[f].some((a) => normHeader(a) === key));
    if (field && !colOf.has(field)) colOf.set(field, i);
  });
  const missing = (['date', 'type'] as Field[]).filter((f) => !colOf.has(f));
  if (!colOf.has('asset') && !colOf.has('symbol')) missing.push('asset');
  if (missing.length) throw new CsvError('error.csv_header', { columns: missing.map((f) => HEADER_LABELS[locale][f]).join(', ') });

  const db = getDb();
  const base = getBaseCurrency();
  const existingAssets = db.select().from(assets).orderBy(asc(assets.id)).all();
  const bySymbol = new Map<string, AssetRow>();
  const byName = new Map<string, AssetRow>();
  for (const a of existingAssets) {
    const sym = normalizeSymbol(a.symbol);
    if (sym && !bySymbol.has(sym)) bySymbol.set(sym, a);
    if (!byName.has(lower(a.name))) byName.set(lower(a.name), a);
  }
  const cats = listCategories();
  const catByName = new Map(cats.map((c) => [lower(c.name), c]));
  const defaultCat = cats.find((c) => c.id === input.default_category_id) ?? cats[0];
  const accRows = db.select().from(accounts).all();
  const accByName = new Map(accRows.map((a) => [lower(a.name), a]));
  const defaultAccount = accRows.find((a) => a.id === input.default_account_id) ?? null;

  const newAssets = new Map<string, PlannedAsset>();
  const newAccounts = new Set<string>();
  const rows: CsvImportRow[] = [];
  const refs: (number | string | null)[] = [];

  table.slice(1).forEach((cells, idx) => {
    const get = (f: Field) => {
      const i = colOf.get(f);
      const v = i === undefined ? undefined : cells[i];
      return v === undefined ? undefined : v.trim();
    };
    const errors: string[] = [];
    const date = parseDate(get('date'));
    if (!date) errors.push(t('csv.err_date'));
    const type = parseType(get('type'));
    if (!type) errors.push(t('csv.err_type', { value: get('type') ?? '' }));
    const nums: Record<'quantity' | 'price' | 'amount' | 'fee' | 'fx_rate', string | null> = {
      quantity: null,
      price: null,
      amount: null,
      fee: null,
      fx_rate: null,
    };
    for (const f of ['quantity', 'price', 'amount', 'fee', 'fx_rate'] as const) {
      const v = parseDecimal(get(f));
      if (v === 'invalid') errors.push(t('csv.err_number', { field: HEADER_LABELS[locale][f] }));
      else nums[f] = v;
    }
    if (type === 'buy' || type === 'sell') {
      if (!nums.quantity) errors.push(t('csv.err_required', { field: HEADER_LABELS[locale].quantity }));
      if (nums.price === null) errors.push(t('csv.err_required', { field: HEADER_LABELS[locale].price }));
    } else if (type === 'valuation') {
      if (nums.price === null && nums.amount === null)
        errors.push(t('csv.err_required', { field: `${HEADER_LABELS[locale].price} / ${HEADER_LABELS[locale].amount}` }));
    } else if (type && nums.amount === null) {
      errors.push(t('csv.err_required', { field: HEADER_LABELS[locale].amount }));
    }

    // 资产匹配：代码（规范化）优先，其次名称
    const name = get('asset') ?? '';
    const symbol = get('symbol') || null;
    const sym = normalizeSymbol(symbol);
    const asset: AssetRow | undefined = (sym && bySymbol.get(sym)) || (name ? byName.get(lower(name)) : undefined);
    let ref: number | string | null = asset?.id ?? null;
    let isNew = false;
    let mode: ValuationMode | null = asset?.valuation_mode ?? null;
    if (!asset) {
      if (!name && !symbol) errors.push(t('csv.err_asset_missing'));
      else if (!input.create_missing) errors.push(t('csv.err_asset', { value: name || symbol || '' }));
      else {
        const key = sym ?? `name:${lower(name)}`;
        let planned = newAssets.get(key);
        if (!planned && type) {
          const inferred: ValuationMode | null =
            type === 'buy' || type === 'sell'
              ? 'market'
              : type === 'deposit' || type === 'withdraw'
                ? 'manual'
                : type === 'valuation'
                  ? nums.price !== null
                    ? 'market'
                    : 'manual'
                  : 'market';
          const cat = catByName.get(lower(get('category') ?? '')) ?? defaultCat;
          const accountName = get('account') || defaultAccount?.name || null;
          if (accountName && !accByName.has(lower(accountName))) newAccounts.add(accountName);
          planned = {
            key,
            name: name || symbol || '',
            symbol,
            currency: (get('currency') || base).toUpperCase(),
            category_id: cat.id,
            category: cat.name,
            account: accountName,
            valuation_mode: inferred,
          };
          newAssets.set(key, planned);
        }
        if (planned) {
          ref = key;
          isNew = true;
          mode = planned.valuation_mode;
        }
      }
    }
    if (type && mode && !(mode === 'market' ? MARKET_TYPES : MANUAL_TYPES).includes(type)) {
      errors.push(
        t('csv.err_mode', { asset: name || symbol || '', mode: t(mode === 'market' ? 'csv.mode_market' : 'csv.mode_manual'), type: TYPE_LABELS[locale][type] }),
      );
    }

    rows.push({
      line: idx + 2,
      date,
      type,
      asset: name || asset?.name || '',
      symbol: symbol ?? asset?.symbol ?? null,
      asset_id: asset?.id ?? null,
      new_asset: isNew,
      quantity: type === 'buy' || type === 'sell' ? nums.quantity : null,
      price: type === 'buy' || type === 'sell' || (type === 'valuation' && mode === 'market') ? nums.price : null,
      amount: type && !['buy', 'sell'].includes(type) && !(type === 'valuation' && mode === 'market') ? nums.amount : null,
      fee: type === 'buy' || type === 'sell' ? nums.fee : null,
      fx_rate: nums.fx_rate,
      note: get('note') || null,
      status: errors.length ? 'error' : 'ok',
      message: errors.length ? errors.join('；') : null,
    });
    refs.push(ref);
  });

  // 重复检测：与已有记录（同资产、日期、类型、数量、价格、金额）或文件内前面的行完全一致
  const existingTx = allTransactions();
  const sig = (
    assetRef: number | string,
    r: { date: string | null; type: string | null; quantity: string | null; price: string | null; amount: string | null },
  ) => [assetRef, r.date, r.type].join('|');
  const seen = new Map<string, { quantity: string | null; price: string | null; amount: string | null }[]>();
  for (const e of existingTx) {
    const k = sig(e.asset_id, e);
    seen.set(k, [...(seen.get(k) ?? []), e]);
  }
  rows.forEach((r, i) => {
    if (r.status !== 'ok') return;
    const k = sig(refs[i]!, r);
    const list = seen.get(k) ?? [];
    if (list.some((e) => sameDecimal(e.quantity, r.quantity) && sameDecimal(e.price, r.price) && sameDecimal(e.amount, r.amount))) {
      r.status = 'duplicate';
      r.message = t('csv.duplicate');
    } else seen.set(k, [...list, r]);
  });

  // 超卖检测：每个资产按日期合并已有流水与新行，逐笔检查卖出不超过当时持仓
  if (rows.some((r) => r.status === 'ok' && r.type === 'sell')) {
    const timeline = new Map<number | string, { date: string; order: number; type: string; quantity: string | null; row?: CsvImportRow }[]>();
    existingTx.forEach((e, i) => {
      if (e.type !== 'buy' && e.type !== 'sell') return;
      const list = timeline.get(e.asset_id) ?? [];
      list.push({ date: e.date, order: i, type: e.type, quantity: e.quantity });
      timeline.set(e.asset_id, list);
    });
    rows.forEach((r, i) => {
      if (r.status !== 'ok' || (r.type !== 'buy' && r.type !== 'sell')) return;
      const list = timeline.get(refs[i]!) ?? [];
      list.push({ date: r.date!, order: existingTx.length + i, type: r.type, quantity: r.quantity, row: r });
      timeline.set(refs[i]!, list);
    });
    for (const list of timeline.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
      let qty = new Decimal(0);
      for (const e of list) {
        const q = new Decimal(e.quantity ?? 0);
        if (e.type === 'buy') qty = qty.plus(q);
        else if (q.gt(qty.plus('1e-9'))) {
          if (e.row) {
            e.row.status = 'error';
            e.row.message = t('csv.err_oversell', { available: qty.toFixed() });
          }
        } else qty = qty.minus(q);
      }
    }
  }

  const okRows = rows.map((r, i) => ({ row: r, assetRef: refs[i]! })).filter((x) => x.row.status === 'ok');
  // 只保留确实有有效行引用的新资产 / 新账户
  const usedNew = new Set(okRows.map((x) => x.assetRef).filter((r): r is string => typeof r === 'string'));
  const finalAssets = new Map([...newAssets].filter(([k]) => usedNew.has(k)));
  const finalAccounts = [...newAccounts].filter((n) => [...finalAssets.values()].some((a) => a.account === n));

  const count = (s: CsvImportRow['status']) => rows.filter((r) => r.status === s).length;
  return {
    preview: {
      rows,
      counts: { ok: count('ok'), duplicate: count('duplicate'), error: count('error') },
      new_assets: [...finalAssets.values()].map((a) => ({
        name: a.name,
        symbol: a.symbol,
        currency: a.currency,
        category: a.category,
        account: a.account,
        valuation_mode: a.valuation_mode,
      })),
      new_accounts: finalAccounts,
    },
    inserts: okRows,
    newAssets: finalAssets,
    newAccounts: finalAccounts,
  };
}

// ---------- 导入：写入 ----------

export function commitCsv(input: CsvImportInput, locale: Locale): CsvImportResult {
  const plan = analyzeCsv(input, locale);
  const db = getDb();
  return dbTx(() => {
    const accountIds = new Map(
      db
        .select()
        .from(accounts)
        .all()
        .map((a) => [lower(a.name), a.id]),
    );
    let sort = db.select().from(accounts).all().length;
    for (const name of plan.newAccounts) {
      const { id } = db.insert(accounts).values({ name, type: 'other', sort_order: sort++ }).returning({ id: accounts.id }).get();
      accountIds.set(lower(name), id);
    }
    const assetIds = new Map<string, { id: number; currency: string }>();
    for (const a of plan.newAssets.values()) {
      const { id } = db
        .insert(assets)
        .values({
          name: a.name,
          symbol: a.symbol,
          category_id: a.category_id,
          account_id: a.account ? (accountIds.get(lower(a.account)) ?? null) : null,
          currency: a.currency,
          valuation_mode: a.valuation_mode,
        })
        .returning({ id: assets.id })
        .get();
      assetIds.set(a.key, { id, currency: a.currency });
    }
    const currencyOf = new Map(
      db
        .select({ id: assets.id, currency: assets.currency })
        .from(assets)
        .all()
        .map((a) => [a.id, a.currency]),
    );
    for (const { row, assetRef } of plan.inserts) {
      const assetId = typeof assetRef === 'number' ? assetRef : assetIds.get(assetRef)!.id;
      db.insert(transactions)
        .values({
          asset_id: assetId,
          type: row.type!,
          date: row.date!,
          quantity: row.quantity,
          price: row.price,
          amount: row.amount,
          fee: row.fee ?? '0',
          ...fxForNewTx(currencyOf.get(assetId)!, row.fx_rate),
          note: row.note,
        })
        .run();
    }
    return {
      imported: plan.inserts.length,
      skipped: plan.preview.rows.length - plan.inserts.length,
      created_assets: plan.newAssets.size,
      created_accounts: plan.newAccounts.length,
    };
  });
}
