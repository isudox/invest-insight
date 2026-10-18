import { describe, expect, it } from 'vitest';
import { normalizeSymbol } from '../src/domain/exposure.js';
import { applyTx, emptyState, toDecimalString, type LedgerTx } from '../src/domain/ledger.js';
import { xirr } from '../src/domain/performance.js';
import { project, requiredMonthly } from '../src/domain/planning.js';

const t = (type: LedgerTx['type'], date: string, f: Partial<LedgerTx> = {}): LedgerTx => ({
  type,
  date,
  quantity: null,
  price: null,
  amount: null,
  fee: '0',
  ...f,
});

describe('账本（移动加权平均成本）', () => {
  it('买入累加数量与成本，价格取最近成交价', () => {
    const s = emptyState();
    applyTx(s, 'market', t('buy', '2025-01-01', { quantity: '100', price: '10', fee: '5' }));
    applyTx(s, 'market', t('buy', '2025-02-01', { quantity: '100', price: '12' }));
    expect(s.quantity.toString()).toBe('200');
    expect(s.cost.toString()).toBe('2205');
    expect(s.value.toString()).toBe('2400');
    expect(s.invested.toString()).toBe('2205');
  });

  it('卖出按均价结转成本并计算已实现收益', () => {
    const s = emptyState();
    applyTx(s, 'market', t('buy', '2025-01-01', { quantity: '100', price: '10' }));
    applyTx(s, 'market', t('buy', '2025-01-02', { quantity: '100', price: '20' }));
    applyTx(s, 'market', t('sell', '2025-01-03', { quantity: '50', price: '30', fee: '10' }));
    // 均价 15，卖出 50 股成本 750，收入 1500 - 10
    expect(s.realized.toString()).toBe('740');
    expect(s.cost.toString()).toBe('2250');
    expect(s.quantity.toString()).toBe('150');
  });

  it('全部卖出后数量与成本归零', () => {
    const s = emptyState();
    applyTx(s, 'market', t('buy', '2025-01-01', { quantity: '3', price: '7' }));
    applyTx(s, 'market', t('sell', '2025-01-02', { quantity: '3', price: '9' }));
    expect(s.quantity.isZero()).toBe(true);
    expect(s.cost.isZero()).toBe(true);
    expect(s.realized.toString()).toBe('6');
  });

  it('十进制计算没有浮点误差', () => {
    const s = emptyState();
    for (let i = 0; i < 10; i++) applyTx(s, 'market', t('buy', '2025-01-01', { quantity: '0.1', price: '0.1' }));
    expect(s.quantity.toString()).toBe('1');
    expect(s.cost.toString()).toBe('0.1');
    // 加密货币 8 位小数
    applyTx(s, 'market', t('buy', '2025-01-02', { quantity: '0.00000001', price: '60000' }));
    expect(s.quantity.toString()).toBe('1.00000001');
  });

  it('手动估值：存入、估值、取出、收入', () => {
    const s = emptyState();
    applyTx(s, 'manual', t('deposit', '2025-01-01', { amount: '50000' }));
    applyTx(s, 'manual', t('valuation', '2025-06-01', { amount: '52000' }));
    applyTx(s, 'manual', t('deposit', '2025-07-01', { amount: '50000' }));
    expect(s.value.toString()).toBe('102000');
    applyTx(s, 'manual', t('income', '2025-08-01', { amount: '300' }));
    applyTx(s, 'manual', t('withdraw', '2025-09-01', { amount: '102000' }));
    expect(s.value.isZero()).toBe(true);
    expect(s.cost.isZero()).toBe(true);
    expect(s.realized.toString()).toBe('2000');
    expect(s.income.toString()).toBe('300');
  });

  it('存储格式不出现科学计数法', () => {
    expect(toDecimalString(0.00000001)).toBe('0.00000001');
    expect(toDecimalString('1e-7')).toBe('0.0000001');
    expect(toDecimalString(null)).toBeNull();
  });
});

describe('XIRR', () => {
  it('一年后 1000 变 1100 约为 10%', () => {
    const r = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-12-31', amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });

  it('现金流没有正负变化时返回 null', () => {
    expect(
      xirr([
        { date: '2024-01-01', amount: 100 },
        { date: '2024-06-01', amount: 100 },
      ]),
    ).toBeNull();
  });
});

describe('证券代码规范化', () => {
  it.each([
    ['600519.SH', '600519'],
    ['SH600519', '600519'],
    ['0700.HK', '00700'],
    ['HK00700', '00700'],
    ['700', '00700'],
    ['aapl', 'AAPL'],
    ['BRK.B', 'BRK.B'],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSymbol(input)).toBe(expected);
  });
});

describe('目标推算', () => {
  it('零收益时为本金加定投', () => {
    expect(project(1000, 100, 0, 12)).toBeCloseTo(2200, 6);
  });

  it('按时达成所需的每月投入可以反推回目标', () => {
    const need = requiredMonthly(10000, 100000, 5, 60)!;
    expect(project(10000, need, 5, 60)).toBeCloseTo(100000, 4);
  });

  it('已超过目标时不需要追加', () => {
    expect(requiredMonthly(200000, 100000, 5, 12)).toBe(0);
  });
});
