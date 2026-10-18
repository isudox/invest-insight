import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, notifyDataChanged, useApi } from '../api';
import { AllocationDonut, ValueChart, type AllocItem } from '../components/charts';
import { AssetForm } from '../components/forms';
import { Chips, Icon, Segmented, STATUS_COLOR, StatusBadge, useToast } from '../components/ui';
import { accountTypeLabel, compact, money, MASK, PALETTE, pct, periodLabel, tone } from '../format';
import i18n from '../i18n';
import type { Account, Health, Performance, PeriodKey, Planning, Summary } from '@invest-insight/shared';

const HERO_PERIODS: PeriodKey[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

export function Dashboard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: s, loading } = useApi<Summary>('/api/summary');
  const [period, setPeriod] = useState<PeriodKey>(() => readPeriod());
  const { data: perf } = useApi<Performance>(`/api/performance?period=${period}`);
  const { data: accounts } = useApi<Account[]>('/api/accounts');
  const { data: planning } = useApi<Planning>('/api/planning');
  const { data: health } = useApi<Health>('/api/health');
  const [allocBy, setAllocBy] = useState<'category' | 'account' | 'currency'>('category');
  const [adding, setAdding] = useState(false);

  if (!s) return loading ? null : <div className="empty">{t('common.backendDown')}</div>;
  const cur = s.base_currency;

  if (s.holdings.length === 0) {
    return (
      <>
        <div className="card empty">
          <h2>{t('dashboard.emptyTitle')}</h2>
          <p>{t('dashboard.emptyText')}</p>
          <div className="actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> {t('dashboard.addFirst')}
            </button>
            <button
              className="btn"
              onClick={async () => {
                await api.post('/api/demo');
                notifyDataChanged();
                toast(t('settings.demoLoaded'));
              }}
            >
              {t('settings.loadDemo')}
            </button>
          </div>
        </div>
        {adding && <AssetForm onClose={() => setAdding(false)} />}
      </>
    );
  }

  const m = perf?.metrics;
  const allTime = perf?.periods.find((p) => p.key === 'ALL');
  const [intPart, decPart] = splitMoney(s.total_value, cur);
  const top = [...s.holdings].sort((a, b) => b.value_base - a.value_base).slice(0, 6);
  const alloc = allocationItems(allocBy, s, accounts ?? []);

  const changePeriod = (p: PeriodKey) => {
    setPeriod(p);
    try {
      localStorage.setItem('ii.period', p);
    } catch {
      /* 忽略 */
    }
  };

  return (
    <>
      <div className="stack">
        <div className="card" style={{ padding: 0 }}>
          <div className="hero">
            <div className="hero-top">
              <div>
                <div className="hero-label">
                  {t('charts.totalAssets')} · {cur}
                </div>
                <div className="hero-value num">
                  {intPart}
                  {decPart && <span className="cents">{decPart}</span>}
                </div>
                {m && (
                  <div className="hero-change">
                    <span className={tone(m.gain)} style={{ fontWeight: 600 }}>
                      {m.gain > 0 ? '+' : ''}
                      {money(m.gain, cur, 0)}
                    </span>
                    <span className={tone(m.twr)}>{pct(m.twr, 2, true)}</span>
                    <span className="muted">{periodLabel(period)}</span>
                  </div>
                )}
              </div>
              <div className="actions">
                <Chips value={period} onChange={changePeriod} options={HERO_PERIODS.map((p) => ({ value: p, label: periodLabel(p) }))} />
                <button className="btn primary small" onClick={() => setAdding(true)}>
                  <Icon name="plus" size={14} /> {t('holdings.add')}
                </button>
              </div>
            </div>
            <div className="legend" style={{ margin: '14px 0 4px' }}>
              <span>
                <i className="dot" style={{ background: 'var(--accent)' }} />
                {t('charts.totalAssets')}
              </span>
              <span>
                <i className="dot" style={{ background: 'var(--muted)' }} />
                {t('charts.cost')}
              </span>
            </div>
            {perf && <ValueChart perf={perf} height={230} />}
            <div className="stat-row">
              <div>
                <div className="label">{t('dashboard.totalReturn')}</div>
                <div className={`value ${tone(s.total_return)}`}>
                  {s.total_return > 0 && s.total_return !== 0 ? '+' : ''}
                  {compact(s.total_return, cur)}
                </div>
                <div className="sub">{t('dashboard.vsInvested', { pct: pct(s.return_percent, 2, true) })}</div>
              </div>
              <div>
                <div className="label">{t('dashboard.annualized')}</div>
                <div className={`value ${tone(allTime?.mwr_annualized ?? allTime?.mwr)}`}>{pct(allTime?.mwr_annualized ?? allTime?.mwr ?? null, 2, true)}</div>
                <div className="sub">{allTime ? t('dashboard.since', { date: allTime.start }) : '—'}</div>
              </div>
              <div>
                <div className="label">{t('dashboard.realizedIncome')}</div>
                <div className={`value ${tone(s.realized + s.income)}`}>{compact(s.realized + s.income, cur)}</div>
                <div className="sub">
                  {t('dashboard.unrealized')} <span className={tone(s.unrealized)}>{compact(s.unrealized, cur)}</span>
                  {Math.abs(s.fx_pnl) >= 1 && (
                    <>
                      {' '}
                      · {t('dashboard.fxPart')} <span className={tone(s.fx_pnl)}>{compact(s.fx_pnl, cur)}</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="label">{t('nav.health')}</div>
                <div className="value">{health?.score ? `${health.score.passed} / ${health.score.total}` : '—'}</div>
                <div className="sub">
                  <Link to="/health" style={{ color: 'var(--accent)' }}>
                    {health?.score && health.score.passed < health.score.total
                      ? t('dashboard.needsAttention', { count: health.score.total - health.score.passed })
                      : t('dashboard.viewDetails')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid two">
          <div className="card">
            <div className="card-head">
              <h2>{t('dashboard.allocation')}</h2>
              <Segmented
                value={allocBy}
                onChange={setAllocBy}
                options={[
                  { value: 'category', label: t('dashboard.byCategory') },
                  { value: 'account', label: t('dashboard.byAccount') },
                  { value: 'currency', label: t('dashboard.byCurrency') },
                ]}
              />
            </div>
            <AllocationDonut categories={alloc} total={s.total_value} currency={cur} />
            {allocBy === 'category' && (
              <div style={{ marginTop: 12 }}>
                <Link to="/rebalance" className="hint" style={{ color: 'var(--accent)', fontSize: 13 }}>
                  {t('dashboard.toRebalance')}
                </Link>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t('dashboard.topHoldings')}</h2>
              <Link to="/holdings" className="hint" style={{ color: 'var(--accent)' }}>
                {t('dashboard.allAssets')}
              </Link>
            </div>
            <div className="list-rows">
              {top.map((h) => (
                <div key={h.id} className="list-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="title">
                      <i className="dot" style={{ background: h.category_color }} />
                      {h.name}
                    </div>
                    <div className="meta">
                      {[h.symbol, h.account_name].filter(Boolean).join(' · ') || h.category_name} · {t('common.weight', { pct: pct(h.weight_percent) })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num">{money(h.value_base, cur, 0)}</div>
                    <div className={`meta ${tone(h.return_percent)}`} style={{ fontSize: 12 }}>
                      {pct(h.return_percent, 2, true)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid two">
          <div className="card">
            <div className="card-head">
              <h2>{t('nav.accounts')}</h2>
              <Link to="/accounts" className="hint" style={{ color: 'var(--accent)' }}>
                {t('dashboard.manageAccounts')}
              </Link>
            </div>
            {!accounts?.length ? (
              <div className="empty" style={{ padding: 24 }}>
                {t('dashboard.noAccounts')}
              </div>
            ) : (
              <div className="list-rows">
                {accounts
                  .filter((a) => a.asset_count > 0)
                  .sort((a, b) => b.value - a.value)
                  .map((a) => (
                    <Link key={a.id} to={`/holdings?account=${a.id}`} className="list-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="title">{a.name}</div>
                        <div className="meta">
                          {accountTypeLabel(a.type)} · {t('common.assetCount', { count: a.asset_count })} · {t('common.weight', { pct: pct(a.percent) })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="num">{money(a.value, cur, 0)}</div>
                        <div className={`meta ${tone(a.total_return)}`} style={{ fontSize: 12 }}>
                          {a.invested > 0 ? pct((a.total_return / a.invested) * 100, 2, true) : '—'}
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t('dashboard.goals')}</h2>
              <Link to="/planning" className="hint" style={{ color: 'var(--accent)' }}>
                {t('dashboard.toPlanning')}
              </Link>
            </div>
            {!planning?.goals.length ? (
              <div className="empty" style={{ padding: 24 }}>
                {t('dashboard.noGoals')}
              </div>
            ) : (
              <div className="list-rows">
                {planning.goals.slice(0, 4).map((g) => (
                  <div key={g.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--grid)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span className="title" style={{ fontWeight: 550 }}>
                        {g.name}
                      </span>
                      <StatusBadge status={g.status} />
                    </div>
                    <div className="progress" style={{ margin: '8px 0 4px' }}>
                      <span style={{ width: `${g.progress}%`, background: STATUS_COLOR[g.status] }} />
                    </div>
                    <div className="meta" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                      <span>
                        {compact(g.current, cur)} / {compact(g.target_amount, cur)}
                      </span>
                      <span>
                        {pct(g.progress, 0)} · {g.target_date.slice(0, 7)}
                      </span>
                    </div>
                  </div>
                ))}
                {planning.fire.fire_number && (
                  <div style={{ paddingTop: 10, fontSize: 13 }} className="secondary">
                    {t('dashboard.fireProgress')} <strong>{pct(planning.fire.progress, 0)}</strong>
                    {planning.fire.fire_date ? t('dashboard.fireEta', { date: planning.fire.fire_date }) : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {adding && <AssetForm onClose={() => setAdding(false)} />}
    </>
  );
}

function readPeriod(): PeriodKey {
  try {
    const p = localStorage.getItem('ii.period');
    if (p && HERO_PERIODS.includes(p as PeriodKey)) return p as PeriodKey;
  } catch {
    /* 忽略 */
  }
  return '1Y';
}

/** 大数字拆成整数与小数两段，小数弱化显示 */
function splitMoney(n: number, cur: string): [string, string] {
  const s = money(n, cur, 2);
  if (s === MASK) return [s, ''];
  const i = s.lastIndexOf('.');
  return i > 0 ? [s.slice(0, i), s.slice(i)] : [s, ''];
}

function allocationItems(by: 'category' | 'account' | 'currency', s: Summary, accounts: Account[]): AllocItem[] {
  const total = s.total_value;
  if (by === 'category') return s.categories;
  const noAccount = i18n.t('common.noAccount');
  const groups = new Map<string, number>();
  for (const h of s.holdings) {
    const key = by === 'account' ? (h.account_name ?? noAccount) : h.currency;
    groups.set(key, (groups.get(key) ?? 0) + h.value_base);
  }
  const order = by === 'account' ? [...accounts.map((a) => a.name), noAccount] : [...groups.keys()].sort((a, b) => (groups.get(b) ?? 0) - (groups.get(a) ?? 0));
  return order
    .filter((k) => groups.has(k))
    .map((k, i) => ({
      id: k,
      name: k,
      // 颜色跟随实体（账户按创建顺序），不随排名变化
      color: k === noAccount ? PALETTE[8] : PALETTE[(by === 'account' ? accounts.findIndex((a) => a.name === k) : i) % 8],
      value: groups.get(k)!,
      current_percent: total > 0 ? (groups.get(k)! / total) * 100 : 0,
      target_percent: 0,
    }));
}
