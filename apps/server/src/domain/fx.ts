import type { AssetRow, TxRow } from '../db/schema.js';
import { Decimal, toDecimalString } from './ledger.js';
import { getBaseCurrency, getFxRates } from './prefs.js';

/**
 * 汇率口径：
 * - 每笔交易记录成交汇率 fx_rate 及当时的基准币种 fx_base；
 * - fx_base 与当前基准币种一致时使用成交汇率，否则（未记录或基准币种已更换）退回当前汇率，并视为「估算」；
 * - 估值使用当前汇率；历史走势使用「截至当日最近一次记录的汇率」，当天及以后使用当前汇率。
 */

export interface TxFx {
  rate: Decimal;
  /** 是否因缺少成交汇率而用当前汇率估算 */
  estimated: boolean;
}

export function txFx(tx: Pick<TxRow, 'fx_rate' | 'fx_base'>, assetCurrency: string, base: string, rates: Record<string, number>): TxFx {
  if (assetCurrency === base) return { rate: new Decimal(1), estimated: false };
  if (tx.fx_rate && tx.fx_base === base) return { rate: new Decimal(tx.fx_rate), estimated: false };
  return { rate: new Decimal(rates[assetCurrency] ?? 1), estimated: true };
}

/** 根据交易中记录的成交汇率构建各币种的汇率历史（阶梯函数） */
export function buildFxHistory(txs: TxRow[], assets: Map<number, AssetRow>, base: string, rates: Record<string, number>, today: string) {
  const obs = new Map<string, { date: string; rate: number }[]>();
  for (const t of txs) {
    const a = assets.get(t.asset_id);
    if (!a || a.currency === base || !t.fx_rate || t.fx_base !== base) continue;
    const list = obs.get(a.currency) ?? [];
    list.push({ date: t.date, rate: Number(t.fx_rate) });
    obs.set(a.currency, list);
  }
  for (const list of obs.values()) list.sort((x, y) => x.date.localeCompare(y.date));

  return (currency: string, date: string): number => {
    if (currency === base) return 1;
    const current = rates[currency] ?? 1;
    const list = obs.get(currency);
    if (!list?.length || date >= today) return current;
    // 二分查找：截至 date 的最后一次记录
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].date <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found >= 0 ? list[found].rate : list[0].rate;
  };
}

/**
 * 新交易要保存的成交汇率：本币交易为 1；外币交易优先用用户填写的值，否则记录当前汇率。
 */
export function fxForNewTx(assetCurrency: string, provided?: string | number | null) {
  const base = getBaseCurrency();
  if (assetCurrency === base) return { fx_rate: '1', fx_base: base };
  if (provided !== undefined && provided !== null && provided !== '') return { fx_rate: toDecimalString(provided), fx_base: base };
  const current = getFxRates()[assetCurrency];
  return { fx_rate: current ? toDecimalString(current) : null, fx_base: base };
}
