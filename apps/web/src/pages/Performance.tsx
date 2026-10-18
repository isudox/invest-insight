import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '../api';
import { TrendChart, ValueChart } from '../components/charts';
import { Chips, Segmented } from '../components/ui';
import { compact, money, pct, periodLabel, tone } from '../format';
import type { History, Income, Performance, PeriodKey } from '@invest-insight/shared';

const PERIODS: PeriodKey[] = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'ALL'];

export function PerformancePage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<PeriodKey>('1Y');
  const [mode, setMode] = useState<'value' | 'return'>('return');
  const [interval, setInterval] = useState<'week' | 'month'>('month');
  const { data: perf } = useApi<Performance>(`/api/performance?period=${period}`);
  const { data: income } = useApi<Income>('/api/income');
  const { data: history } = useApi<History>(`/api/history?interval=${interval}`);

  if (!perf) return null;
  const cur = perf.base_currency;
  const m = perf.metrics;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('nav.performance')}</h1>
          <p>{t('performance.subtitle')}</p>
        </div>
        <Chips value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: periodLabel(p) }))} />
      </div>

      {!m ? (
        <div className="card empty">{t('performance.noData')}</div>
      ) : (
        <div className="stack">
          <div className="grid kpis">
            <div className="card kpi">
              <div className="label">{t('performance.gain')}</div>
              <div className={`value ${tone(m.gain)}`}>
                {m.gain > 0 ? '+' : ''}
                {compact(m.gain, cur)}
              </div>
              <div className="sub">{t('performance.range', { start: m.start, end: m.end })}</div>
            </div>
            <div className="card kpi">
              <div className="label">{t('performance.twr')}</div>
              <div className={`value ${tone(m.twr)}`}>{pct(m.twr, 2, true)}</div>
              <div className="sub">
                {m.twr_annualized !== null ? t('performance.annualized', { pct: pct(m.twr_annualized, 2, true) }) : t('performance.twrHint')}
              </div>
            </div>
            <div className="card kpi">
              <div className="label">{t('performance.mwr')}</div>
              <div className={`value ${tone(m.mwr)}`}>{pct(m.mwr, 2, true)}</div>
              <div className="sub">
                {m.mwr_annualized !== null ? t('performance.annualized', { pct: pct(m.mwr_annualized, 2, true) }) : t('performance.mwrHint')}
              </div>
            </div>
            <div className="card kpi">
              <div className="label">{t('performance.maxDrawdown')}</div>
              <div className={`value ${m.max_drawdown < 0 ? 'down' : ''}`}>{pct(m.max_drawdown, 2)}</div>
              <div className="sub">{m.drawdown_peak ? `${m.drawdown_peak} → ${m.drawdown_trough}` : t('performance.noDrawdown')}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{mode === 'return' ? t('charts.cumulativeTwr') : t('performance.valueAndCost')}</h2>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'return', label: t('performance.returnMode') },
                  { value: 'value', label: t('performance.valueMode') },
                ]}
              />
            </div>
            {mode === 'value' && (
              <div className="legend" style={{ marginBottom: 6 }}>
                <span>
                  <i className="dot" style={{ background: 'var(--accent)' }} />
                  {t('charts.totalAssets')}
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--muted)' }} />
                  {t('charts.cost')}
                </span>
              </div>
            )}
            <ValueChart perf={perf} mode={mode} height={280} />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t('performance.periodsTitle')}</h2>
              <span className="hint">{t('performance.netInflowHint')}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('performance.period')}</th>
                    <th className="r">{t('performance.startValue')}</th>
                    <th className="r">{t('performance.netInflow')}</th>
                    <th className="r">{t('performance.endValue')}</th>
                    <th className="r">{t('performance.gainAmount')}</th>
                    <th className="r">TWR</th>
                    <th className="r">XIRR</th>
                    <th className="r">{t('performance.annualXirr')}</th>
                    <th className="r">{t('performance.maxDrawdown')}</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.periods.map((p) => (
                    <tr key={p.key} style={p.key === period ? { background: 'var(--surface-2)' } : undefined} onClick={() => setPeriod(p.key)}>
                      <td>
                        {periodLabel(p.key)}
                        <div className="asset-sub">{t('performance.from', { date: p.start })}</div>
                      </td>
                      <td className="r">{compact(p.start_value, cur)}</td>
                      <td className="r">{compact(p.net_inflow, cur)}</td>
                      <td className="r">{compact(p.end_value, cur)}</td>
                      <td className={`r ${tone(p.gain)}`}>{compact(p.gain, cur)}</td>
                      <td className={`r ${tone(p.twr)}`}>{pct(p.twr, 2, true)}</td>
                      <td className={`r ${tone(p.mwr)}`}>{pct(p.mwr, 2, true)}</td>
                      <td className={`r ${tone(p.mwr_annualized)}`}>{pct(p.mwr_annualized, 2, true)}</td>
                      <td className="r">{pct(p.max_drawdown, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="help" style={{ marginBottom: 0 }}>
              {t('performance.explain')}
            </p>
          </div>

          <div className="card">{history && <TrendChart history={history} onIntervalChange={setInterval} />}</div>

          {income && <IncomeSection income={income} />}
        </div>
      )}
    </>
  );
}

function IncomeSection({ income }: { income: Income }) {
  const { t } = useTranslation();
  const cur = income.base_currency;
  return (
    <>
      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <h2>{t('performance.incomeTitle')}</h2>
            <span className="hint">{t('performance.incomeHint')}</span>
          </div>
          <div className="grid half" style={{ gap: 8, marginBottom: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t('performance.last12')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 650 }}>{money(income.last12, cur, 0)}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t('performance.avgTotal')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 650 }}>
                {money(income.monthly_avg, cur, 0)}{' '}
                <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                  · {compact(income.total, cur)}
                </span>
              </div>
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={income.months} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="var(--axis)"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  tickLine={false}
                  minTickGap={24}
                  tickFormatter={(m: string) => m.slice(2).replace('-', '/')}
                />
                <YAxis
                  stroke="var(--axis)"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => compact(v, cur)}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="chart-tip">
                        <div className="tip-title">{label}</div>
                        <div className="tip-row">
                          <span>{t('performance.income')}</span>
                          <span className="num">{money(payload[0].value as number, cur, 0)}</span>
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="amount" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>{t('performance.incomeSources')}</h2>
          </div>
          {income.assets.length === 0 ? (
            <div className="empty" style={{ padding: 32 }}>
              {t('performance.incomeEmpty')}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('common.asset')}</th>
                    <th className="r">{t('performance.count')}</th>
                    <th className="r">{t('performance.last12')}</th>
                    <th className="r">{t('performance.cumulative')}</th>
                  </tr>
                </thead>
                <tbody>
                  {income.assets.map((a) => (
                    <tr key={a.asset_id}>
                      <td>
                        <i className="dot" style={{ background: a.category_color }} />
                        {a.name}
                      </td>
                      <td className="r">{a.count}</td>
                      <td className="r">{money(a.last12, cur, 0)}</td>
                      <td className="r">{money(a.total, cur, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {income.years.length > 0 && (
            <p className="help" style={{ marginBottom: 0 }}>
              {t('performance.byYear', {
                list: income.years.map((y) => t('performance.yearAmount', { year: y.year, amount: compact(y.amount, cur) })).join(t('common.listSep')),
              })}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
