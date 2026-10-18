import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, money, pct } from '../format';
import i18n from '../i18n';
import type { History, Performance } from '@invest-insight/shared';

export interface AllocItem {
  id: number | string;
  name: string;
  color: string;
  value: number;
  current_percent: number;
  target_percent: number;
}
import { Segmented } from './ui';

const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--muted)', fontSize: 12 },
  tickLine: false,
} as const;

// ---------- 配置环形图 + 目标对比 ----------

export function AllocationDonut({ categories, total, currency }: { categories: AllocItem[]; total: number; currency: string }) {
  const [active, setActive] = useState<number | string | null>(null);
  const hasTargets = categories.some((c) => c.target_percent > 0);
  const data = categories.filter((c) => c.value > 0);
  const focus = active !== null ? categories.find((c) => c.id === active) : null;

  return (
    <div className="donut-wrap">
      <div className="donut-center" style={{ width: 200, height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={96}
              paddingAngle={data.length > 1 ? 1 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_, i) => setActive(data[i].id)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((c) => (
                <Cell key={c.id} fill={c.color} opacity={active === null || active === c.id ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-label">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              {focus ? focus.name : i18n.t('charts.totalAssets')}
            </div>
            <div className="big">{compact(focus ? focus.value : total, currency)}</div>
            {focus && (
              <div className="secondary" style={{ fontSize: 12 }}>
                {pct(focus.current_percent)}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="alloc-list" style={{ width: '100%' }}>
        {categories.map((c) => (
          <div
            key={c.id}
            className="alloc-row"
            onMouseEnter={() => setActive(c.id)}
            onMouseLeave={() => setActive(null)}
            title={i18n.t(hasTargets ? 'charts.allocTipTarget' : 'charts.allocTip', {
              name: c.name,
              value: money(c.value, currency, 0),
              pct: pct(c.current_percent),
              target: pct(c.target_percent),
            })}
          >
            <span style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <i className="dot" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="bar">
              <span className="fill" style={{ width: `${Math.min(100, c.current_percent)}%`, background: c.color }} />
              {c.target_percent > 0 && <span className="target" style={{ left: `calc(${Math.min(100, c.target_percent)}% - 1px)` }} />}
            </span>
            <span className="num" style={{ textAlign: 'right' }}>
              {pct(c.current_percent)}
            </span>
          </div>
        ))}
        {hasTargets && (
          <div className="help" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 2, height: 12, background: 'var(--text)', display: 'inline-block', borderRadius: 1 }} /> {i18n.t('charts.targetMarker')}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 资产走势 ----------

function TrendTooltip({ active, payload, label, currency, mode }: any) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].reverse();
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="chart-tip">
      <div className="tip-title">{label}</div>
      {rows.map((p: any) => (
        <div className="tip-row" key={p.dataKey}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <i className="dot" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num">{money(p.value, currency, 0)}</span>
        </div>
      ))}
      {mode === 'category' && (
        <div className="tip-row" style={{ borderTop: '1px solid var(--grid)', marginTop: 4, paddingTop: 4 }}>
          <span>{i18n.t('common.total')}</span>
          <span className="num">{money(total, currency, 0)}</span>
        </div>
      )}
    </div>
  );
}

export function TrendChart({ history, onIntervalChange }: { history: History; onIntervalChange: (v: 'week' | 'month') => void }) {
  const [mode, setMode] = useState<'total' | 'category'>('total');
  const currency = history.base_currency;
  const cats = history.categories.filter((c) => history.points.some((p) => (p.by_category[c.id] ?? 0) > 0));
  const data = history.points.map((p) => {
    const row: Record<string, number | string> = {
      date: p.date.slice(history.interval === 'month' ? 0 : 5, history.interval === 'month' ? 7 : 10),
      total: p.total,
      cost: p.cost,
    };
    for (const c of cats) row[`c${c.id}`] = p.by_category[c.id] ?? 0;
    return row;
  });

  return (
    <div>
      <div className="card-head">
        <h2>{i18n.t('charts.trendTitle')}</h2>
        <div className="actions">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'total', label: i18n.t('charts.totalAssets') },
              { value: 'category', label: i18n.t('charts.byCategory') },
            ]}
          />
          <Segmented
            value={history.interval}
            onChange={onIntervalChange}
            options={[
              { value: 'month', label: i18n.t('charts.month') },
              { value: 'week', label: i18n.t('charts.week') },
            ]}
          />
        </div>
      </div>
      {data.length < 2 ? (
        <div className="empty" style={{ padding: 40 }}>
          {i18n.t('charts.trendEmpty')}
        </div>
      ) : (
        <>
          <div className="legend" style={{ marginBottom: 8 }}>
            {mode === 'total' ? (
              <>
                <span>
                  <i className="dot" style={{ background: 'var(--accent)' }} />
                  {i18n.t('charts.totalAssets')}
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--muted)' }} />
                  {i18n.t('charts.cost')}
                </span>
              </>
            ) : (
              cats.map((c) => (
                <span key={c.id}>
                  <i className="dot" style={{ background: c.color }} />
                  {c.name}
                </span>
              ))
            )}
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              {mode === 'total' ? (
                <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="date" {...axisProps} minTickGap={24} />
                  <YAxis {...axisProps} axisLine={false} width={64} tickFormatter={(v) => compact(v, currency)} domain={['auto', 'auto']} />
                  <Tooltip content={<TrendTooltip currency={currency} mode="total" />} cursor={{ stroke: 'var(--axis)' }} />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name={i18n.t('charts.cost')}
                    stroke="var(--muted)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name={i18n.t('charts.totalAssets')}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : (
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="date" {...axisProps} minTickGap={24} />
                  <YAxis {...axisProps} axisLine={false} width={64} tickFormatter={(v) => compact(v, currency)} />
                  <Tooltip content={<TrendTooltip currency={currency} mode="category" />} cursor={{ stroke: 'var(--axis)' }} />
                  {cats.map((c) => (
                    <Area
                      key={c.id}
                      type="monotone"
                      dataKey={`c${c.id}`}
                      name={c.name}
                      stackId="1"
                      stroke="var(--surface)"
                      strokeWidth={1}
                      fill={c.color}
                      fillOpacity={0.9}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 总览 Hero 走势（参考 Wealthfolio 的大数字 + 面积图） ----------

function ValueTooltip({ active, payload, label, currency, mode }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="tip-title">{label}</div>
      {mode === 'return' ? (
        <div className="tip-row">
          <span>{i18n.t('charts.cumulativeTwr')}</span>
          <span className="num">{pct(p.twr, 2, true)}</span>
        </div>
      ) : (
        <>
          <div className="tip-row">
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <i className="dot" style={{ background: 'var(--accent)' }} />
              {i18n.t('charts.totalAssets')}
            </span>
            <span className="num">{money(p.value, currency, 0)}</span>
          </div>
          <div className="tip-row">
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <i className="dot" style={{ background: 'var(--muted)' }} />
              {i18n.t('charts.cost')}
            </span>
            <span className="num">{money(p.cost, currency, 0)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function ValueChart({ perf, height = 240, mode = 'value' }: { perf: Performance; height?: number; mode?: 'value' | 'return' }) {
  const currency = perf.base_currency;
  if (perf.series.length < 2) {
    return (
      <div className="empty" style={{ padding: 40 }}>
        {i18n.t('charts.valueEmpty')}
      </div>
    );
  }
  const key = mode === 'return' ? 'twr' : 'value';
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={perf.series} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" {...axisProps} minTickGap={48} tickFormatter={(d: string) => d.slice(2, 7).replace('-', '/')} />
          <YAxis
            {...axisProps}
            axisLine={false}
            width={mode === 'return' ? 48 : 64}
            orientation="right"
            domain={['auto', 'auto']}
            tickFormatter={(v) => (mode === 'return' ? `${v.toFixed(0)}%` : compact(v, currency))}
          />
          <Tooltip content={<ValueTooltip currency={currency} mode={mode} />} cursor={{ stroke: 'var(--axis)' }} />
          {mode === 'value' && (
            <Line type="stepAfter" dataKey="cost" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          )}
          <Area
            type="monotone"
            dataKey={key}
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#valueFill)"
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
