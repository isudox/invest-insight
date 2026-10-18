import { asc } from 'drizzle-orm';
import type { Planning } from '@invest-insight/shared';
import { getDb } from '../db/index.js';
import { accounts, goals as goalsTable, type GoalRow } from '../db/schema.js';
import { computeSummary, toDateStr } from './portfolio.js';
import { getPrefs } from './prefs.js';
import { translate, type Locale } from '../i18n.js';

/**
 * 目标规划（参考 Wealthfolio Goals & Save-Up Planner）与 FIRE 测算（参考 Ghostfolio FIRE）。
 * 按月复利：每月末追加一次定投。
 */

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

export function project(current: number, monthly: number, annualPct: number, months: number) {
  const m = monthlyRate(annualPct);
  if (Math.abs(m) < 1e-12) return current + monthly * months;
  const g = Math.pow(1 + m, months);
  return current * g + (monthly * (g - 1)) / m;
}

export function requiredMonthly(current: number, target: number, annualPct: number, months: number) {
  if (months <= 0) return current >= target ? 0 : null;
  const m = monthlyRate(annualPct);
  const g = Math.pow(1 + m, months);
  const gap = target - current * g;
  if (gap <= 0) return 0;
  return Math.abs(m) < 1e-12 ? gap / months : (gap * m) / (g - 1);
}

function monthsUntil(date: string) {
  const now = new Date();
  const t = new Date(date + 'T00:00:00');
  return Math.max(0, (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()));
}

export function computePlanning(locale: Locale = 'zh-CN'): Planning {
  const s = computeSummary();
  const prefs = getPrefs();
  const accountValue = new Map<number, number>();
  for (const h of s.holdings) if (h.account_id) accountValue.set(h.account_id, (accountValue.get(h.account_id) ?? 0) + h.value_base);
  const accountNames = new Map(
    getDb()
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .all()
      .map((a) => [a.id, a.name]),
  );

  const rows: GoalRow[] = getDb().select().from(goalsTable).orderBy(asc(goalsTable.target_date), asc(goalsTable.id)).all();
  const goals = rows.map((g) => {
    let current = s.total_value;
    let scopeName = translate(locale, 'scope.portfolio');
    if (g.scope_type === 'category') {
      const c = s.categories.find((x) => x.id === g.scope_id);
      current = c?.value ?? 0;
      scopeName = translate(locale, 'scope.category', { name: c?.name ?? translate(locale, 'scope.deleted') });
    } else if (g.scope_type === 'account') {
      current = accountValue.get(g.scope_id ?? -1) ?? 0;
      scopeName = translate(locale, 'scope.account', { name: accountNames.get(g.scope_id ?? -1) ?? translate(locale, 'scope.deleted') });
    }
    const months = monthsUntil(g.target_date);
    const projected = project(current, g.monthly_contribution, g.expected_return, months);
    const ratio = projected / g.target_amount;
    const status: Planning['goals'][number]['status'] =
      current >= g.target_amount ? 'achieved' : ratio >= 1 ? 'on_track' : ratio >= 0.9 ? 'at_risk' : 'off_track';

    // 年度轨迹：悲观（-2%）、预期、乐观（+2%）
    const now = new Date();
    const trajectory: { date: string; pessimistic: number; nominal: number; optimistic: number }[] = [];
    for (let k = 0; k <= months; k += Math.max(1, Math.ceil(months / 24))) {
      trajectory.push({
        date: toDateStr(new Date(now.getFullYear(), now.getMonth() + k, 1)).slice(0, 7),
        pessimistic: project(current, g.monthly_contribution, g.expected_return - 2, k),
        nominal: project(current, g.monthly_contribution, g.expected_return, k),
        optimistic: project(current, g.monthly_contribution, g.expected_return + 2, k),
      });
    }
    if (months > 0 && trajectory[trajectory.length - 1].date !== g.target_date.slice(0, 7)) {
      trajectory.push({
        date: g.target_date.slice(0, 7),
        pessimistic: project(current, g.monthly_contribution, g.expected_return - 2, months),
        nominal: projected,
        optimistic: project(current, g.monthly_contribution, g.expected_return + 2, months),
      });
    }

    return {
      ...g,
      scope_name: scopeName,
      current,
      progress: Math.min(100, (current / g.target_amount) * 100),
      months_left: months,
      projected,
      status,
      required_monthly: requiredMonthly(current, g.target_amount, g.expected_return, months),
      trajectory,
    };
  });

  // FIRE：按安全提取率估算可持续的被动收入，以及达成财务自由所需时间
  const annualExpense = prefs.monthly_expense * 12;
  const fireNumber = annualExpense > 0 ? annualExpense / (prefs.fire_swr / 100) : null;
  let monthsToFire: number | null = null;
  if (fireNumber !== null) {
    if (s.total_value >= fireNumber) monthsToFire = 0;
    else {
      for (let k = 1; k <= 1200; k++) {
        if (project(s.total_value, prefs.fire_monthly_saving, prefs.fire_return, k) >= fireNumber) {
          monthsToFire = k;
          break;
        }
      }
    }
  }
  const fireDate = monthsToFire === null ? null : toDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + monthsToFire, 1)).slice(0, 7);

  return {
    base_currency: s.base_currency,
    total_value: s.total_value,
    goals,
    fire: {
      monthly_expense: prefs.monthly_expense,
      swr: prefs.fire_swr,
      expected_return: prefs.fire_return,
      monthly_saving: prefs.fire_monthly_saving,
      sustainable_annual: (s.total_value * prefs.fire_swr) / 100,
      fire_number: fireNumber,
      progress: fireNumber ? Math.min(100, (s.total_value / fireNumber) * 100) : null,
      months_to_fire: monthsToFire,
      fire_date: fireDate,
    },
  };
}
