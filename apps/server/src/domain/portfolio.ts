import { asc, eq } from 'drizzle-orm';
import type { CategorySummary, Holding, Rebalance, Summary } from '@invest-insight/shared';
import { getDb } from '../db/index.js';
import { accounts, assets, categories, transactions, type AssetRow, type CategoryRow, type TxRow } from '../db/schema.js';
import { buildFxHistory, txFx } from './fx.js';
import { applyTx, emptyState, type AssetState } from './ledger.js';
import { fxToBase, getBaseCurrency, getFxRates } from './prefs.js';

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function listCategories(): CategoryRow[] {
  return getDb().select().from(categories).orderBy(asc(categories.sort_order), asc(categories.id)).all();
}

export function listAssets(includeArchived: boolean): AssetRow[] {
  const q = getDb().select().from(assets);
  return (includeArchived ? q : q.where(eq(assets.archived, 0))).orderBy(asc(assets.id)).all();
}

export function allTransactions(): TxRow[] {
  return getDb().select().from(transactions).orderBy(asc(transactions.date), asc(transactions.id)).all();
}

/** 回放全部流水，得到每个资产的状态（外币交易按成交汇率折算基准币种成本） */
export function replayAll(assetRows: AssetRow[], txs: TxRow[] = allTransactions(), base = getBaseCurrency(), rates = getFxRates()) {
  const byId = new Map(assetRows.map((a) => [a.id, a]));
  const states = new Map<number, AssetState>();
  const counts = new Map<number, number>();
  /** 缺少成交汇率、按当前汇率估算的外币交易笔数 */
  const estimated = new Map<number, number>();
  for (const t of txs) {
    const a = byId.get(t.asset_id);
    if (!a) continue;
    let s = states.get(t.asset_id);
    if (!s) states.set(t.asset_id, (s = emptyState()));
    const fx = txFx(t, a.currency, base, rates);
    applyTx(s, a.valuation_mode, t, fx.rate);
    counts.set(t.asset_id, (counts.get(t.asset_id) ?? 0) + 1);
    if (fx.estimated && t.type !== 'valuation') estimated.set(t.asset_id, (estimated.get(t.asset_id) ?? 0) + 1);
  }
  return { states, counts, estimated };
}

/** 当前持仓（金额同时给出原币种与基准币种） */
export function computeHoldings(includeArchived = false): Holding[] {
  const rates = getFxRates();
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const accs = new Map(
    getDb()
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .all()
      .map((a) => [a.id, a.name]),
  );
  const rows = listAssets(includeArchived);
  const { states, counts, estimated } = replayAll(rows, allTransactions(), getBaseCurrency(), rates);

  const holdings: Holding[] = rows.map((a) => {
    const s = states.get(a.id) ?? emptyState();
    const fx = fxToBase(a.currency, rates);
    const cat = cats.get(a.category_id);
    const value = s.value.toNumber();
    const cost = s.cost.toNumber();
    const valueBase = value * fx;
    // 成本、已实现、收入、投入均按成交汇率折算；市值按当前汇率
    const costBase = s.costBase.toNumber();
    const unrealized = valueBase - costBase;
    const realized = s.realizedBase.toNumber();
    const income = s.incomeBase.toNumber();
    const invested = s.investedBase.toNumber();
    const totalReturn = unrealized + realized + income;
    return {
      ...a,
      account_name: a.account_id ? (accs.get(a.account_id) ?? null) : null,
      category_name: cat?.name ?? '—',
      category_color: cat?.color ?? '#898781',
      fx_rate: fx,
      quantity: s.quantity.toNumber(),
      price: s.price.toNumber(),
      value,
      cost,
      value_base: valueBase,
      cost_base: costBase,
      invested_base: invested,
      unrealized_base: unrealized,
      price_pnl_base: (value - cost) * fx,
      fx_pnl_base: cost * fx - costBase,
      fx_estimated_count: estimated.get(a.id) ?? 0,
      realized_base: realized,
      income_base: income,
      total_return_base: totalReturn,
      return_percent: invested > 0 ? (totalReturn / invested) * 100 : null,
      weight_percent: 0,
      last_price_date: s.lastPriceDate,
      tx_count: counts.get(a.id) ?? 0,
    };
  });

  const total = holdings.reduce((sum, h) => sum + (h.archived ? 0 : h.value_base), 0);
  for (const h of holdings) h.weight_percent = total > 0 && !h.archived ? (h.value_base / total) * 100 : 0;
  return holdings;
}

export function computeSummary(): Summary {
  const holdings = computeHoldings(false);
  const cats = listCategories();
  const sum = (f: (h: Holding) => number, hs = holdings) => hs.reduce((s, h) => s + f(h), 0);
  const totalValue = sum((h) => h.value_base);
  const unrealized = sum((h) => h.unrealized_base);
  const pricePnl = sum((h) => h.price_pnl_base);
  const fxPnl = sum((h) => h.fx_pnl_base);
  const realized = sum((h) => h.realized_base);
  const income = sum((h) => h.income_base);
  const invested = sum((h) => h.invested_base);

  const byCategory: CategorySummary[] = cats.map((c) => {
    const hs = holdings.filter((h) => h.category_id === c.id);
    const value = sum((h) => h.value_base, hs);
    const current = totalValue > 0 ? (value / totalValue) * 100 : 0;
    return {
      ...c,
      value,
      cost: sum((h) => h.cost_base, hs),
      total_return: sum((h) => h.total_return_base, hs),
      current_percent: current,
      drift_percent: current - c.target_percent,
      asset_count: hs.length,
    };
  });

  return {
    base_currency: getBaseCurrency(),
    total_value: totalValue,
    total_cost: sum((h) => h.cost_base),
    total_invested: invested,
    unrealized,
    price_pnl: pricePnl,
    fx_pnl: fxPnl,
    realized,
    income,
    total_return: unrealized + realized + income,
    return_percent: invested > 0 ? ((unrealized + realized + income) / invested) * 100 : null,
    target_sum: cats.reduce((s, c) => s + c.target_percent, 0),
    max_drift: byCategory.reduce((m, c) => Math.max(m, Math.abs(c.drift_percent)), 0),
    categories: byCategory,
    holdings,
  };
}

/** 资产构成走势：回放到每个月末 / 周日（外币按截至当日记录的成交汇率估值） */
export function computeHistory(interval: 'week' | 'month') {
  const rates = getFxRates();
  const base = getBaseCurrency();
  const rows = listAssets(true);
  const assetMap = new Map(rows.map((a) => [a.id, a]));
  const txs = allTransactions().filter((t) => assetMap.has(t.asset_id));
  if (txs.length === 0) return [];

  const points: string[] = [];
  const today = new Date();
  const todayStr = toDateStr(today);
  const start = new Date(txs[0].date + 'T00:00:00');
  if (interval === 'month') {
    for (let d = new Date(start.getFullYear(), start.getMonth() + 1, 0); d < today; d = new Date(d.getFullYear(), d.getMonth() + 2, 0))
      points.push(toDateStr(d));
  } else {
    const d = new Date(start);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    for (; d < today; d.setDate(d.getDate() + 7)) points.push(toDateStr(d));
  }
  if (points[points.length - 1] !== todayStr) points.push(todayStr);
  const fxAt = buildFxHistory(txs, assetMap, base, rates, todayStr);

  const states = new Map<number, AssetState>();
  const result: { date: string; total: number; cost: number; by_category: Record<number, number> }[] = [];
  let i = 0;
  for (const point of points) {
    for (; i < txs.length && txs[i].date <= point; i++) {
      const t = txs[i];
      const a = assetMap.get(t.asset_id)!;
      let s = states.get(a.id);
      if (!s) states.set(a.id, (s = emptyState()));
      applyTx(s, a.valuation_mode, t, txFx(t, a.currency, base, rates).rate);
    }
    const byCat: Record<number, number> = {};
    let total = 0;
    let cost = 0;
    for (const [id, s] of states) {
      const a = assetMap.get(id)!;
      const v = s.value.toNumber() * fxAt(a.currency, point);
      byCat[a.category_id] = (byCat[a.category_id] ?? 0) + v;
      total += v;
      cost += s.costBase.toNumber();
    }
    result.push({ date: point, total, cost, by_category: byCat });
  }
  return result;
}

/** 再平衡建议：按目标比例计算每个类别应增减的金额（基准币种） */
export function computeRebalance(newMoney: number, mode: 'full' | 'buy_only'): Rebalance {
  const summary = computeSummary();
  const cats = summary.categories;
  const targetSum = cats.reduce((s, c) => s + c.target_percent, 0);
  const finalTotal = summary.total_value + newMoney;

  const rows = cats.map((c) => {
    const targetPct = targetSum > 0 ? (c.target_percent / targetSum) * 100 : 0;
    const targetValue = (finalTotal * targetPct) / 100;
    return {
      category_id: c.id,
      name: c.name,
      color: c.color,
      current_value: c.value,
      current_percent: c.current_percent,
      target_percent: targetPct,
      target_value: targetValue,
      delta: targetValue - c.value,
      after_value: 0,
      after_percent: 0,
    };
  });

  if (mode === 'buy_only') {
    // 只用新增资金补足低配类别；超出缺口的部分按目标比例分配
    const deficits = rows.map((r) => Math.max(0, r.delta));
    const deficitSum = deficits.reduce((s, d) => s + d, 0);
    const used = Math.min(newMoney, deficitSum);
    rows.forEach((r, idx) => (r.delta = deficitSum > 0 ? (deficits[idx] / deficitSum) * used : 0));
    const leftover = newMoney - used;
    if (leftover > 0) rows.forEach((r) => (r.delta += (leftover * r.target_percent) / 100));
  }

  for (const r of rows) {
    r.after_value = r.current_value + r.delta;
    r.after_percent = finalTotal > 0 ? (r.after_value / finalTotal) * 100 : 0;
  }

  return {
    base_currency: summary.base_currency,
    total_value: summary.total_value,
    new_money: newMoney,
    final_total: finalTotal,
    target_sum: targetSum,
    mode,
    rows,
    holdings: summary.holdings.map((h) => ({ id: h.id, name: h.name, category_id: h.category_id, value_base: h.value_base })),
  };
}
