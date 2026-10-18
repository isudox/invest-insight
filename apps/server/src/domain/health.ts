import type { Health, HealthRule } from '@invest-insight/shared';
import { translate, type Locale, type MessageKey, type Params } from '../i18n.js';
import { computeExposure, UNDISCLOSED, UNSET_SECTOR } from './exposure.js';
import { Decimal } from './ledger.js';
import { allTransactions, computeSummary, listAssets, toDateStr } from './portfolio.js';
import { txFx } from './fx.js';
import { getFxRates, getPrefs } from './prefs.js';

/**
 * 组合体检：参考 Ghostfolio X-ray（静态风险规则）与 Wealthfolio Health Center（数据质量检查）。
 * 每条规则给出 pass / warn / fail / info，以及说明和可前往处理的页面。文案按请求语言生成。
 */

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
// 用于识别「现金类」类别（未在设置中指定时）
const CASH_NAME = /现金|存款|活期|cash|deposit|savings/i;
const CRYPTO_NAME = /加密|crypto/i;

export function runHealthCheck(locale: Locale = 'zh-CN'): Health {
  const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
  const fmtMoney = (n: number, c: string) => `${c} ${Math.round(n).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}`;
  const sep = t('health.list_sep');
  const G = {
    concentration: t('health.group.concentration'),
    allocation: t('health.group.allocation'),
    liquidity: t('health.group.liquidity'),
    cost: t('health.group.cost'),
    data: t('health.group.data'),
  };

  const prefs = getPrefs();
  const s = computeSummary();
  const cur = s.base_currency;
  const total = s.total_value;
  const results: HealthRule[] = [];
  const add = (r: HealthRule) => results.push(r);

  if (s.holdings.length === 0) return { base_currency: cur, prefs, results: [], score: null };

  // ---------- 集中度 ----------
  const topAsset = [...s.holdings].sort((a, b) => b.value_base - a.value_base)[0];
  const overAssets = s.holdings.filter((h) => h.weight_percent > prefs.max_single_asset);
  add({
    id: 'single_asset',
    group: G.concentration,
    title: t('health.single_asset.title'),
    status: overAssets.length ? 'warn' : 'pass',
    message: t(overAssets.length ? 'health.single_asset.warn' : 'health.single_asset.pass', {
      count: overAssets.length,
      limit: prefs.max_single_asset,
      name: topAsset.name,
      pct: fmtPct(topAsset.weight_percent),
    }),
    details: overAssets.map((h) => t('health.detail.pct', { name: h.name, pct: fmtPct(h.weight_percent) })),
    link: '/holdings',
  });

  const exp = computeExposure();
  const topStock = exp.securities[0];
  if (topStock) {
    const over = exp.securities.filter((x) => x.percent > prefs.max_single_stock);
    add({
      id: 'single_stock',
      group: G.concentration,
      title: t('health.single_stock.title'),
      status: over.length ? 'warn' : 'pass',
      message: t(over.length ? 'health.single_stock.warn' : 'health.single_stock.pass', {
        count: over.length,
        limit: prefs.max_single_stock,
        name: topStock.name,
        pct: fmtPct(topStock.percent),
      }),
      details: over.map(
        (x) =>
          t('health.detail.pct', { name: x.name, pct: fmtPct(x.percent) }) +
          (x.indirect > 0 ? t('health.single_stock.detail_via', { pct: fmtPct(x.indirect_percent) }) : ''),
      ),
      link: '/exposure',
    });
  }
  const sectors = exp.sectors.filter((x) => x.name !== UNDISCLOSED && x.name !== UNSET_SECTOR);
  if (sectors.length) {
    const over = sectors.filter((x) => x.percent > prefs.max_sector);
    add({
      id: 'sector',
      group: G.concentration,
      title: t('health.sector.title'),
      status: over.length ? 'warn' : 'pass',
      message: over.length
        ? t('health.sector.warn', { list: over.map((x) => `${x.name} ${fmtPct(x.percent)}`).join(sep), limit: prefs.max_sector })
        : t('health.sector.pass', { name: sectors[0].name, pct: fmtPct(sectors[0].percent) }),
      link: '/exposure',
    });
  }

  const unassigned = t('health.account.unassigned');
  const byAccount = new Map<string, number>();
  for (const h of s.holdings) byAccount.set(h.account_name ?? unassigned, (byAccount.get(h.account_name ?? unassigned) ?? 0) + h.value_base);
  const accounts = [...byAccount.entries()].sort((a, b) => b[1] - a[1]);
  const named = accounts.filter(([n]) => n !== unassigned);
  if (named.length === 0) {
    add({ id: 'account', group: G.concentration, title: t('health.account.title'), status: 'info', message: t('health.account.none'), link: '/accounts' });
  } else {
    const [topName, topValue] = accounts[0];
    const p = total > 0 ? (topValue / total) * 100 : 0;
    add({
      id: 'account',
      group: G.concentration,
      title: t('health.account.title'),
      status: p > prefs.max_account ? 'warn' : 'pass',
      message:
        t('health.account.message', { count: accounts.length, name: topName, pct: fmtPct(p) }) +
        (p > prefs.max_account ? t('health.account.over', { limit: prefs.max_account }) : ''),
      link: '/accounts',
    });
  }

  const foreign = s.holdings.filter((h) => h.currency !== cur).reduce((x, h) => x + h.value_base, 0);
  const foreignPct = total > 0 ? (foreign / total) * 100 : 0;
  add({
    id: 'currency',
    group: G.concentration,
    title: t('health.currency.title'),
    status: foreignPct > prefs.max_foreign_currency ? 'warn' : 'pass',
    message:
      t('health.currency.message', { currency: cur, pct: fmtPct(foreignPct) }) +
      (foreignPct > prefs.max_foreign_currency ? t('health.currency.over', { limit: prefs.max_foreign_currency }) : ''),
  });

  // ---------- 配置 ----------
  const drifted = s.categories.filter((c) => Math.abs(c.drift_percent) > prefs.rebalance_band);
  add({
    id: 'drift',
    group: G.allocation,
    title: t('health.drift.title'),
    status: s.target_sum <= 0 ? 'info' : drifted.length ? 'warn' : 'pass',
    message:
      s.target_sum <= 0
        ? t('health.drift.none')
        : drifted.length
          ? t('health.drift.warn', {
              count: drifted.length,
              band: prefs.rebalance_band,
              list: drifted.map((c) => `${c.name} ${c.drift_percent > 0 ? '+' : ''}${c.drift_percent.toFixed(1)}%`).join(sep),
            })
          : t('health.drift.pass', { band: prefs.rebalance_band }),
    link: '/rebalance',
  });
  if (s.target_sum > 0 && Math.abs(s.target_sum - 100) > 0.01) {
    add({
      id: 'target_sum',
      group: G.allocation,
      title: t('health.target_sum.title'),
      status: 'warn',
      message: t('health.target_sum.warn', { sum: s.target_sum.toFixed(1) }),
      link: '/rebalance',
    });
  }

  // ---------- 流动性 ----------
  const cashIds = prefs.emergency_category_ids.length
    ? new Set(prefs.emergency_category_ids)
    : new Set(s.categories.filter((c) => CASH_NAME.test(c.name) && !CRYPTO_NAME.test(c.name)).map((c) => c.id));
  const cash = s.categories.filter((c) => cashIds.has(c.id)).reduce((x, c) => x + c.value, 0);
  if (prefs.monthly_expense > 0) {
    const months = cash / prefs.monthly_expense;
    add({
      id: 'emergency',
      group: G.liquidity,
      title: t('health.emergency.title'),
      status: months >= prefs.emergency_months ? 'pass' : months >= prefs.emergency_months / 2 ? 'warn' : 'fail',
      message: t('health.emergency.message', { amount: fmtMoney(cash, cur), months: months.toFixed(1), target: prefs.emergency_months }),
    });
  } else {
    add({
      id: 'emergency',
      group: G.liquidity,
      title: t('health.emergency.title'),
      status: 'info',
      message: t('health.emergency.unset', { amount: fmtMoney(cash, cur) }),
    });
  }

  // ---------- 成本 ----------
  const rates = getFxRates();
  const currencyOf = new Map(listAssets(true).map((a) => [a.id, a.currency]));
  let feeBase = 0;
  let buyBase = 0;
  for (const tx of allTransactions()) {
    const fx = txFx(tx, currencyOf.get(tx.asset_id) ?? cur, cur, rates).rate;
    feeBase += new Decimal(tx.fee ?? 0).times(fx).toNumber();
    if (tx.type === 'buy')
      buyBase += new Decimal(tx.quantity ?? 0)
        .times(tx.price ?? 0)
        .times(fx)
        .toNumber();
  }
  if (buyBase > 0) {
    const ratio = (feeBase / buyBase) * 100;
    add({
      id: 'fees',
      group: G.cost,
      title: t('health.fees.title'),
      status: ratio > prefs.max_fee_ratio ? 'warn' : 'pass',
      message: t('health.fees.message', { amount: fmtMoney(feeBase, cur), ratio: ratio.toFixed(3), limit: prefs.max_fee_ratio }),
    });
  }

  // ---------- 数据质量 ----------
  const today = new Date();
  const ago = (n: number) => toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  const stale = s.holdings.filter((h) => {
    if (h.value_base <= 0) return false;
    const days = h.valuation_mode === 'market' ? prefs.stale_market_days : prefs.stale_manual_days;
    return !h.last_price_date || h.last_price_date < ago(days);
  });
  add({
    id: 'stale',
    group: G.data,
    title: t('health.stale.title'),
    status: stale.length ? 'warn' : 'pass',
    message: stale.length
      ? t('health.stale.warn', { count: stale.length, market: prefs.stale_market_days, manual: prefs.stale_manual_days })
      : t('health.stale.pass'),
    details: stale.map((h) => t('health.stale.detail', { name: h.name, date: h.last_price_date ?? t('health.stale.never') })),
    link: '/holdings',
  });

  const missingFx = [...new Set(s.holdings.map((h) => h.currency))].filter((c) => !(c in rates));
  add({
    id: 'fx',
    group: G.data,
    title: t('health.fx.title'),
    status: missingFx.length ? 'fail' : 'pass',
    message: missingFx.length ? t('health.fx.fail', { list: missingFx.join(sep) }) : t('health.fx.pass'),
    link: '/settings',
  });

  const estimatedTx = s.holdings.reduce((n, h) => n + h.fx_estimated_count, 0);
  const hasForeign = s.holdings.some((h) => h.currency !== cur);
  if (hasForeign) {
    add({
      id: 'trade_fx',
      group: G.data,
      title: t('health.trade_fx.title'),
      status: estimatedTx ? 'warn' : 'pass',
      message: estimatedTx ? t('health.trade_fx.warn', { count: estimatedTx }) : t('health.trade_fx.pass'),
      details: s.holdings.filter((h) => h.fx_estimated_count > 0).map((h) => t('health.trade_fx.detail', { name: h.name, count: h.fx_estimated_count })),
      link: '/transactions',
    });
  }

  add({
    id: 'components',
    group: G.data,
    title: t('health.components.title'),
    status: exp.missing_funds.length ? 'warn' : 'pass',
    message: exp.missing_funds.length
      ? t('health.components.warn', { count: exp.missing_funds.length })
      : exp.funds.length
        ? t('health.components.pass', { count: exp.funds.length })
        : t('health.components.none'),
    details: exp.missing_funds.map((f) => f.name),
    link: '/exposure',
  });

  if (exp.funds.length) {
    const staleComp = exp.funds.filter((f) => !f.as_of || f.as_of < ago(120));
    add({
      id: 'components_age',
      group: G.data,
      title: t('health.components_age.title'),
      status: staleComp.length ? 'warn' : 'pass',
      message: staleComp.length ? t('health.components_age.warn', { count: staleComp.length }) : t('health.components_age.pass'),
      details: staleComp.map((f) => t('health.components_age.detail', { name: f.name, date: f.as_of ?? t('health.components_age.unknown') })),
      link: '/exposure',
    });
  }

  const noSector = exp.securities.filter((x) => x.direct > 0 && !x.sector);
  add({
    id: 'sector_missing',
    group: G.data,
    title: t('health.sector_missing.title'),
    status: noSector.length ? 'warn' : 'pass',
    message: noSector.length ? t('health.sector_missing.warn', { count: noSector.length }) : t('health.sector_missing.pass'),
    details: noSector.map((x) => x.name),
    link: '/holdings',
  });

  const noAccount = s.holdings.filter((h) => !h.account_id);
  if (named.length > 0 && noAccount.length) {
    add({
      id: 'account_missing',
      group: G.data,
      title: t('health.account_missing.title'),
      status: 'info',
      message: t('health.account_missing.info', { count: noAccount.length }),
      details: noAccount.map((h) => h.name),
      link: '/holdings',
    });
  }

  const scored = results.filter((r) => r.status !== 'info');
  const passed = scored.filter((r) => r.status === 'pass').length;
  return { base_currency: cur, prefs, results, score: { passed, total: scored.length } };
}
