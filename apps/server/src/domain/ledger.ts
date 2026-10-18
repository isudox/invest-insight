import Decimal from 'decimal.js';
import type { ValuationMode } from '@invest-insight/shared';
import type { TxRow } from '../db/schema.js';

/**
 * 账本：按 (日期, ID) 顺序回放交易流水，得到单个资产的持仓状态。
 * 全程使用 decimal.js 计算，避免数量、成本在多次买卖后累积浮点误差；
 * 报表层再转为 number 做汇总与展示。
 *
 * 同时维护两套成本：
 * - 原币种（cost / realized / income / invested）；
 * - 基准币种，按每笔交易的成交汇率折算（costBase 等）。
 * 当前市值按当前汇率折算后，浮动盈亏可拆分为价格收益与汇率收益：
 *   价格收益 = (原币市值 − 原币成本) × 当前汇率
 *   汇率收益 = 原币成本 × 当前汇率 − 基准币种历史成本
 */

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type LedgerTx = Pick<TxRow, 'type' | 'date' | 'quantity' | 'price' | 'amount' | 'fee'>;

export interface AssetState {
  quantity: Decimal;
  /** 当前持仓的剩余成本（原币种） */
  cost: Decimal;
  /** 最新单价（market 模式） */
  price: Decimal;
  /** 当前估值（原币种） */
  value: Decimal;
  /** 已实现盈亏（卖出 / 取出，原币种） */
  realized: Decimal;
  /** 分红、利息等收入（原币种） */
  income: Decimal;
  /** 累计投入（买入 + 存入，原币种） */
  invested: Decimal;
  /** 以下为按成交汇率折算的基准币种金额 */
  costBase: Decimal;
  realizedBase: Decimal;
  incomeBase: Decimal;
  investedBase: Decimal;
  lastPriceDate: string | null;
  firstDate: string | null;
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const dec = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? ZERO : new Decimal(v));

export function emptyState(): AssetState {
  return {
    quantity: ZERO,
    cost: ZERO,
    price: ZERO,
    value: ZERO,
    realized: ZERO,
    income: ZERO,
    invested: ZERO,
    costBase: ZERO,
    realizedBase: ZERO,
    incomeBase: ZERO,
    investedBase: ZERO,
    lastPriceDate: null,
    firstDate: null,
  };
}

/**
 * 回放单笔交易。交易需按 (date, id) 升序传入。
 * @param fx 该笔交易的成交汇率（1 单位资产币种 = fx 单位基准币种）；本币资产为 1
 */
export function applyTx(s: AssetState, mode: ValuationMode, tx: LedgerTx, fx: Decimal.Value = ONE): void {
  const q = dec(tx.quantity);
  const p = dec(tx.price);
  const amt = dec(tx.amount);
  const fee = dec(tx.fee);
  const rate = new Decimal(fx);
  if (!s.firstDate) s.firstDate = tx.date;

  switch (tx.type) {
    case 'buy': {
      const total = q.times(p).plus(fee);
      s.quantity = s.quantity.plus(q);
      s.cost = s.cost.plus(total);
      s.invested = s.invested.plus(total);
      s.costBase = s.costBase.plus(total.times(rate));
      s.investedBase = s.investedBase.plus(total.times(rate));
      if (p.gt(0)) {
        s.price = p;
        s.lastPriceDate = tx.date;
      }
      break;
    }
    case 'sell': {
      // 移动加权平均成本：按持仓比例结转卖出部分的成本（原币与基准币种各自结转）
      const sellQty = Decimal.min(q, s.quantity);
      const ratio = s.quantity.gt(0) ? sellQty.div(s.quantity) : ZERO;
      const costOut = s.cost.times(ratio);
      const costOutBase = s.costBase.times(ratio);
      const proceeds = sellQty.times(p).minus(fee);
      s.realized = s.realized.plus(proceeds.minus(costOut));
      s.realizedBase = s.realizedBase.plus(proceeds.times(rate).minus(costOutBase));
      s.cost = s.cost.minus(costOut);
      s.costBase = s.costBase.minus(costOutBase);
      s.quantity = s.quantity.minus(sellQty);
      if (s.quantity.lte(0)) {
        s.quantity = ZERO;
        s.cost = ZERO;
        s.costBase = ZERO;
      }
      if (p.gt(0)) {
        s.price = p;
        s.lastPriceDate = tx.date;
      }
      break;
    }
    case 'deposit': {
      s.cost = s.cost.plus(amt);
      s.invested = s.invested.plus(amt);
      s.costBase = s.costBase.plus(amt.times(rate));
      s.investedBase = s.investedBase.plus(amt.times(rate));
      s.value = s.value.plus(amt);
      break;
    }
    case 'withdraw': {
      const costOut = Decimal.min(amt, s.cost);
      const costOutBase = s.cost.gt(0) ? s.costBase.times(costOut).div(s.cost) : ZERO;
      s.realized = s.realized.plus(amt.minus(costOut));
      s.realizedBase = s.realizedBase.plus(amt.times(rate).minus(costOutBase));
      s.cost = s.cost.minus(costOut);
      s.costBase = s.costBase.minus(costOutBase);
      s.value = Decimal.max(ZERO, s.value.minus(amt));
      break;
    }
    case 'income': {
      s.income = s.income.plus(amt);
      s.incomeBase = s.incomeBase.plus(amt.times(rate));
      break;
    }
    case 'valuation': {
      if (mode === 'market') {
        if (p.gt(0)) s.price = p;
      } else {
        s.value = amt;
      }
      s.lastPriceDate = tx.date;
      break;
    }
  }

  if (mode === 'market') s.value = s.quantity.times(s.price);
}

/** 规范化为不含科学计数法的十进制字符串，作为存储格式 */
export function toDecimalString(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  return new Decimal(v).toFixed();
}

export { Decimal };
