import Decimal from 'decimal.js';
import type { ValuationMode } from '@invest-insight/shared';
import type { TxRow } from '../db/schema.js';

/**
 * 账本：按 (日期, ID) 顺序回放交易流水，得到单个资产的持仓状态（原币种）。
 * 全程使用 decimal.js 计算，避免数量、成本在多次买卖后累积浮点误差；
 * 报表层再转为 number 做汇总与展示。
 */

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type LedgerTx = Pick<TxRow, 'type' | 'date' | 'quantity' | 'price' | 'amount' | 'fee'>;

export interface AssetState {
  quantity: Decimal;
  /** 当前持仓的剩余成本 */
  cost: Decimal;
  /** 最新单价（market 模式） */
  price: Decimal;
  /** 当前估值 */
  value: Decimal;
  /** 已实现盈亏（卖出 / 取出） */
  realized: Decimal;
  /** 分红、利息等收入 */
  income: Decimal;
  /** 累计投入（买入 + 存入） */
  invested: Decimal;
  lastPriceDate: string | null;
  firstDate: string | null;
}

const ZERO = new Decimal(0);
const dec = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? ZERO : new Decimal(v));

export function emptyState(): AssetState {
  return { quantity: ZERO, cost: ZERO, price: ZERO, value: ZERO, realized: ZERO, income: ZERO, invested: ZERO, lastPriceDate: null, firstDate: null };
}

export function applyTx(s: AssetState, mode: ValuationMode, tx: LedgerTx): void {
  const q = dec(tx.quantity);
  const p = dec(tx.price);
  const amt = dec(tx.amount);
  const fee = dec(tx.fee);
  if (!s.firstDate) s.firstDate = tx.date;

  switch (tx.type) {
    case 'buy': {
      const total = q.times(p).plus(fee);
      s.quantity = s.quantity.plus(q);
      s.cost = s.cost.plus(total);
      s.invested = s.invested.plus(total);
      if (p.gt(0)) {
        s.price = p;
        s.lastPriceDate = tx.date;
      }
      break;
    }
    case 'sell': {
      // 移动加权平均成本：按均价结转卖出部分的成本
      const sellQty = Decimal.min(q, s.quantity);
      const costOut = s.quantity.gt(0) ? s.cost.times(sellQty).div(s.quantity) : ZERO;
      s.realized = s.realized.plus(sellQty.times(p).minus(fee).minus(costOut));
      s.cost = s.cost.minus(costOut);
      s.quantity = s.quantity.minus(sellQty);
      if (s.quantity.lte(0)) {
        s.quantity = ZERO;
        s.cost = ZERO;
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
      s.value = s.value.plus(amt);
      break;
    }
    case 'withdraw': {
      const costOut = Decimal.min(amt, s.cost);
      s.realized = s.realized.plus(amt.minus(costOut));
      s.cost = s.cost.minus(costOut);
      s.value = Decimal.max(ZERO, s.value.minus(amt));
      break;
    }
    case 'income': {
      s.income = s.income.plus(amt);
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
