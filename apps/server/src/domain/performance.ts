import { and, eq } from 'drizzle-orm';
import type { Income, Performance, PeriodKey, PeriodMetrics } from '@invest-insight/shared';
import { PERIOD_KEYS } from '@invest-insight/shared';
import { getDb } from '../db/index.js';
import { assets as assetsTable, categories, transactions } from '../db/schema.js';
import { applyTx, Decimal, emptyState, type AssetState } from './ledger.js';
import { allTransactions, listAssets, toDateStr } from './portfolio.js';
import { fxToBase, getBaseCurrency, getFxRates } from './prefs.js';

/**
 * 收益表现：按天回放交易流水，得到每日市值与外部资金流，
 * 计算时间加权收益（TWR）、资金加权收益（MWR / XIRR）、最大回撤等。
 *
 * 外部资金流：买入、存入视为流入；卖出、取出、分红利息（到手现金）视为流出。
 */

export const PERIODS: readonly PeriodKey[] = PERIOD_KEYS;

interface DayPoint {
  date: string;
  value: number;
  cost: number;
  inflow: number;
  outflow: number;
  /** 当日收益率（TWR 链中的一环），无法计算时为 null */
  r: number | null;
}

const DAY_MS = 86400000;
// 用日历加法而非 +24h，避免夏令时切换当天日期不前进
const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, day + n));
};
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / DAY_MS);

export function dailySeries(): DayPoint[] {
  const rates = getFxRates();
  const assetMap = new Map(listAssets(true).map((a) => [a.id, a]));
  const txs = allTransactions().filter((t) => assetMap.has(t.asset_id));
  if (!txs.length) return [];

  const today = toDateStr(new Date());
  const states = new Map<number, AssetState>();
  const points: DayPoint[] = [];
  let i = 0;
  let prevValue = 0;
  for (let d = txs[0].date; d <= today; d = addDays(d, 1)) {
    let inflow = 0;
    let outflow = 0;
    while (i < txs.length && txs[i].date <= d) {
      const tx = txs[i++];
      const a = assetMap.get(tx.asset_id)!;
      const fx = fxToBase(a.currency, rates);
      const q = new Decimal(tx.quantity ?? 0);
      const p = new Decimal(tx.price ?? 0);
      const amt = new Decimal(tx.amount ?? 0).toNumber();
      const fee = new Decimal(tx.fee ?? 0);
      if (tx.type === 'buy') inflow += q.times(p).plus(fee).toNumber() * fx;
      else if (tx.type === 'sell') outflow += q.times(p).minus(fee).toNumber() * fx;
      else if (tx.type === 'deposit') inflow += amt * fx;
      else if (tx.type === 'withdraw') outflow += amt * fx;
      else if (tx.type === 'income') outflow += amt * fx;
      let s = states.get(a.id);
      if (!s) states.set(a.id, (s = emptyState()));
      applyTx(s, a.valuation_mode, tx);
    }
    let value = 0;
    let cost = 0;
    for (const [id, s] of states) {
      const fx = fxToBase(assetMap.get(id)!.currency, rates);
      value += s.value.toNumber() * fx;
      cost += s.cost.toNumber() * fx;
    }
    const base = prevValue + inflow;
    const r = base >= 1 ? (value + outflow - prevValue - inflow) / base : null;
    points.push({ date: d, value, cost, inflow, outflow, r });
    prevValue = value;
  }
  return points;
}

function periodStart(key: PeriodKey, first: string, today: string): string {
  const t = new Date(today + 'T00:00:00');
  let d: Date;
  switch (key) {
    case '1M':
      d = new Date(t.getFullYear(), t.getMonth() - 1, t.getDate());
      break;
    case '3M':
      d = new Date(t.getFullYear(), t.getMonth() - 3, t.getDate());
      break;
    case '6M':
      d = new Date(t.getFullYear(), t.getMonth() - 6, t.getDate());
      break;
    case 'YTD':
      d = new Date(t.getFullYear(), 0, 1);
      break;
    case '1Y':
      d = new Date(t.getFullYear() - 1, t.getMonth(), t.getDate());
      break;
    case '3Y':
      d = new Date(t.getFullYear() - 3, t.getMonth(), t.getDate());
      break;
    default:
      return first;
  }
  const s = toDateStr(d);
  return s < first ? first : s;
}

/** XIRR：求使净现值为 0 的年化收益率（二分法）。 */
export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;
  const t0 = flows[0].date;
  const npv = (rate: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, daysBetween(t0, f.date) / 365.25), 0);
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function periodMetrics(series: DayPoint[], key: PeriodKey): PeriodMetrics {
  const today = series[series.length - 1].date;
  const start = periodStart(key, series[0].date, today);
  const startIdx = series.findIndex((p) => p.date >= start);
  const window = series.slice(startIdx);
  const before = startIdx > 0 ? series[startIdx - 1] : null;
  const startValue = before?.value ?? 0;
  const endValue = window[window.length - 1].value;
  const inflow = window.reduce((s, p) => s + p.inflow, 0);
  const outflow = window.reduce((s, p) => s + p.outflow, 0);
  const gain = endValue - startValue - (inflow - outflow);

  // TWR 与累计指数（用于回撤）
  let index = 1;
  let peak = 1;
  let maxDd = 0;
  let ddPeak = start;
  let ddTrough = start;
  let curPeakDate = start;
  for (const p of window) {
    if (p.r !== null) index *= 1 + p.r;
    if (index > peak) {
      peak = index;
      curPeakDate = p.date;
    }
    const dd = index / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      ddPeak = curPeakDate;
      ddTrough = p.date;
    }
  }
  const twr = index - 1;
  const days = Math.max(1, daysBetween(before?.date ?? window[0].date, today));
  const annualize = (r: number) => Math.pow(1 + r, 365.25 / days) - 1;

  // MWR：期初市值视为投入，期间流入为投入、流出为回收，期末市值为回收
  const flows: { date: string; amount: number }[] = [];
  if (startValue > 0) flows.push({ date: before!.date, amount: -startValue });
  for (const p of window) {
    const net = p.outflow - p.inflow;
    if (Math.abs(net) > 1e-9) flows.push({ date: p.date, amount: net });
  }
  flows.push({ date: today, amount: endValue });
  const mwrAnnual = xirr(flows);
  const mwrPeriod = mwrAnnual === null ? null : Math.pow(1 + mwrAnnual, days / 365.25) - 1;

  return {
    key,
    start: window[0].date,
    end: today,
    days,
    start_value: startValue,
    end_value: endValue,
    net_inflow: inflow - outflow,
    gain,
    twr: twr * 100,
    twr_annualized: days >= 365 ? annualize(twr) * 100 : null,
    mwr: mwrPeriod === null ? null : mwrPeriod * 100,
    mwr_annualized: mwrAnnual === null || days < 365 ? null : mwrAnnual * 100,
    max_drawdown: maxDd * 100,
    drawdown_peak: maxDd < 0 ? ddPeak : null,
    drawdown_trough: maxDd < 0 ? ddTrough : null,
  };
}

export function computePerformance(key: PeriodKey): Performance {
  const series = dailySeries();
  const base = getBaseCurrency();
  if (!series.length) return { base_currency: base, period: key, metrics: null, periods: [], series: [] };
  const metrics = periodMetrics(series, key);
  // 起点早于首笔交易的区间与「全部」重复，不再单列
  const periods = PERIODS.map((k) => periodMetrics(series, k)).filter((m) => m.key === 'ALL' || m.start > series[0].date);

  // 图表序列：期间每日市值、成本与累计 TWR
  const startIdx = series.findIndex((p) => p.date >= metrics.start);
  const window = series.slice(startIdx);
  let index = 1;
  let netInvested = 0;
  const full = window.map((p) => {
    if (p.r !== null) index *= 1 + p.r;
    netInvested += p.inflow - p.outflow;
    return { date: p.date, value: p.value, cost: p.cost, net_invested: netInvested, twr: (index - 1) * 100 };
  });
  const step = Math.ceil(full.length / 400);
  const chart = full.filter((_, i) => i % step === 0 || i === full.length - 1);

  return { base_currency: base, period: key, metrics, periods, series: chart };
}

/** 分红、利息等收入统计 */
export function computeIncome(): Income {
  const rates = getFxRates();
  const rows = getDb()
    .select({
      date: transactions.date,
      amount: transactions.amount,
      asset_id: assetsTable.id,
      asset_name: assetsTable.name,
      currency: assetsTable.currency,
      category_name: categories.name,
      category_color: categories.color,
    })
    .from(transactions)
    .innerJoin(assetsTable, eq(assetsTable.id, transactions.asset_id))
    .innerJoin(categories, eq(categories.id, assetsTable.category_id))
    .where(and(eq(transactions.type, 'income')))
    .orderBy(transactions.date)
    .all();

  const byMonth = new Map<string, number>();
  const byYear = new Map<string, number>();
  const byAsset = new Map<
    number,
    { asset_id: number; name: string; category_name: string; category_color: string; total: number; last12: number; count: number }
  >();
  const today = new Date();
  const cutoff = toDateStr(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  let total = 0;
  let last12 = 0;
  for (const r of rows) {
    const v = new Decimal(r.amount ?? 0).toNumber() * fxToBase(r.currency, rates);
    total += v;
    if (r.date > cutoff) last12 += v;
    byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) ?? 0) + v);
    byYear.set(r.date.slice(0, 4), (byYear.get(r.date.slice(0, 4)) ?? 0) + v);
    const a = byAsset.get(r.asset_id) ?? {
      asset_id: r.asset_id,
      name: r.asset_name,
      category_name: r.category_name,
      category_color: r.category_color,
      total: 0,
      last12: 0,
      count: 0,
    };
    a.total += v;
    a.count += 1;
    if (r.date > cutoff) a.last12 += v;
    byAsset.set(r.asset_id, a);
  }

  // 最近 24 个月（含无收入的月份）
  const months: { month: string; amount: number }[] = [];
  for (let k = 23; k >= 0; k--) {
    const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const m = toDateStr(d).slice(0, 7);
    months.push({ month: m, amount: byMonth.get(m) ?? 0 });
  }

  return {
    base_currency: getBaseCurrency(),
    total,
    last12,
    monthly_avg: last12 / 12,
    months,
    years: [...byYear.entries()].map(([year, amount]) => ({ year, amount })),
    assets: [...byAsset.values()].sort((a, b) => b.total - a.total),
  };
}
