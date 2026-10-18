import { useEffect, useState } from 'react';
import { api, notifyDataChanged, useApi } from '../api';
import { Icon, Segmented, useToast } from '../components/ui';
import { compact, money, pct } from '../format';
import i18n from '../i18n';
import type { Prefs, Rebalance as RebalanceData, Summary } from '@invest-insight/shared';

export function Rebalance() {
  const toast = useToast();
  const { data: summary } = useApi<Summary>('/api/summary');
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [newMoney, setNewMoney] = useState('');
  const [mode, setMode] = useState<'full' | 'buy_only'>('full');
  const [threshold, setThreshold] = useState(1000);
  const { data: prefs } = useApi<Prefs>('/api/prefs');
  const band = prefs?.rebalance_band ?? 5;
  const { data: plan } = useApi<RebalanceData>(`/api/rebalance?newMoney=${Number(newMoney) || 0}&mode=${mode}`);

  useEffect(() => {
    if (summary) setTargets(Object.fromEntries(summary.categories.map((c) => [c.id, String(c.target_percent)])));
  }, [summary]);

  if (!summary || !plan) return null;
  const cur = summary.base_currency;
  const sum = Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0);
  const dirty = summary.categories.some((c) => Number(targets[c.id]) !== c.target_percent);

  const saveTargets = async () => {
    await api.put(
      '/api/categories/targets',
      summary.categories.map((c) => ({ id: c.id, target_percent: Number(targets[c.id]) || 0 })),
    );
    notifyDataChanged();
    toast(i18n.t('rebalance.targetsSaved'));
  };

  const equalize = () => {
    const withAssets = summary.categories.filter((c) => c.asset_count > 0);
    const list = withAssets.length ? withAssets : summary.categories;
    const each = Math.floor((100 / list.length) * 10) / 10;
    const next: Record<number, string> = {};
    summary.categories.forEach((c) => (next[c.id] = '0'));
    list.forEach((c, i) => (next[c.id] = String(i === 0 ? Math.round((100 - each * (list.length - 1)) * 10) / 10 : each)));
    setTargets(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{i18n.t('nav.rebalance')}</h1>
          <p>{i18n.t('rebalance.subtitle')}</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <h2>{i18n.t('rebalance.targets')}</h2>
            <span className="hint" style={Math.abs(sum - 100) > 0.01 ? { color: 'var(--warn)' } : undefined}>
              {i18n.t('rebalance.sum', { sum: sum.toFixed(1) })}
              {Math.abs(sum - 100) > 0.01 ? i18n.t('rebalance.sumHint') : ''}
            </span>
          </div>
          <div className="alloc-list" style={{ gap: 14 }}>
            {summary.categories.map((c) => {
              const t = Number(targets[c.id]) || 0;
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                      <span>
                        <i className="dot" style={{ background: c.color }} />
                        {c.name}
                      </span>
                      <span className="secondary num">
                        {i18n.t('rebalance.current', { pct: pct(c.current_percent) })} · <DriftText drift={c.current_percent - t} band={band} />
                      </span>
                    </div>
                    <div className="alloc-row" style={{ gridTemplateColumns: '1fr' }}>
                      <span className="bar">
                        <span className="fill" style={{ width: `${Math.min(100, c.current_percent)}%`, background: c.color }} />
                        {t > 0 && <span className="target" style={{ left: `calc(${Math.min(100, t)}% - 1px)` }} />}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      className="input target-input num"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={targets[c.id] ?? ''}
                      onChange={(e) => setTargets({ ...targets, [c.id]: e.target.value })}
                      aria-label={i18n.t('rebalance.targetFor', { name: c.name })}
                    />
                    <span className="muted">%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="actions" style={{ marginTop: 18, justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={equalize}>
              {i18n.t('rebalance.equalize')}
            </button>
            <div className="actions">
              {dirty && (
                <button className="btn" onClick={() => setTargets(Object.fromEntries(summary.categories.map((c) => [c.id, String(c.target_percent)])))}>
                  {i18n.t('rebalance.reset')}
                </button>
              )}
              <button className="btn primary" onClick={saveTargets} disabled={!dirty}>
                <Icon name="check" /> {i18n.t('rebalance.saveTargets')}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid)', flexWrap: 'wrap' }}>
            <span className="secondary">{i18n.t('rebalance.band')}</span>
            <input
              className="input num"
              style={{ width: 72 }}
              type="number"
              min={0}
              max={50}
              step={0.5}
              defaultValue={band}
              key={band}
              onBlur={async (e) => {
                const v = Number(e.target.value);
                if (!(v >= 0) || v === band) return;
                await api.put('/api/prefs', { rebalance_band: v });
                notifyDataChanged();
                toast(i18n.t('rebalance.bandSaved'));
              }}
              aria-label={i18n.t('rebalance.bandLabel')}
            />
            <span className="secondary">%</span>
            <span className="help">{i18n.t('rebalance.bandHelp')}</span>
          </div>
          <p className="help" style={{ marginTop: 8 }}>
            {i18n.t('rebalance.targetsHelp')}
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>{i18n.t('rebalance.plan')}</h2>
            <span className="hint">{i18n.t('rebalance.planHint')}</span>
          </div>
          <div className="filters" style={{ marginBottom: 14 }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'full', label: i18n.t('rebalance.modeFull') },
                { value: 'buy_only', label: i18n.t('rebalance.modeBuyOnly') },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="secondary">{i18n.t('rebalance.newMoney')}</span>
              <input
                className="input num"
                style={{ width: 140 }}
                type="number"
                min={0}
                step={1000}
                placeholder="0"
                value={newMoney}
                onChange={(e) => setNewMoney(e.target.value)}
              />
              <span className="muted">{cur}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="secondary">{i18n.t('rebalance.ignoreBelow')}</span>
              <input
                className="input num"
                style={{ width: 90 }}
                type="number"
                min={0}
                step={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              />
              <span className="muted">{i18n.t('rebalance.ignoreBelowSuffix')}</span>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{i18n.t('common.category')}</th>
                  <th className="r">{i18n.t('rebalance.currentValue')}</th>
                  <th className="r">{i18n.t('rebalance.currentToTarget')}</th>
                  <th className="r">{i18n.t('rebalance.action')}</th>
                  <th className="r">{i18n.t('rebalance.after')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => {
                  const skip = Math.abs(r.delta) < threshold;
                  const inCat = plan.holdings.filter((h) => h.category_id === r.category_id && h.value_base > 0);
                  const catTotal = inCat.reduce((s, h) => s + h.value_base, 0);
                  return (
                    <tr key={r.category_id}>
                      <td>
                        <i className="dot" style={{ background: r.color }} />
                        {r.name}
                      </td>
                      <td className="r">{compact(r.current_value, cur)}</td>
                      <td className="r">
                        {pct(r.current_percent)} <span className="muted">→ {pct(r.target_percent)}</span>
                      </td>
                      <td className="r" style={{ whiteSpace: 'normal', minWidth: 160 }}>
                        {skip ? (
                          <span className="muted">{i18n.t('rebalance.hold')}</span>
                        ) : (
                          <>
                            <strong style={{ color: r.delta > 0 ? 'var(--accent)' : 'var(--warn)' }}>
                              {r.delta > 0 ? i18n.t('rebalance.buy') : i18n.t('rebalance.sell')} {money(Math.abs(r.delta), cur, 0)}
                            </strong>
                            {inCat.length > 1 && (
                              <div className="asset-sub" title={i18n.t('rebalance.splitHint')}>
                                {inCat
                                  .sort((a, b) => b.value_base - a.value_base)
                                  .slice(0, 3)
                                  .map((h) => `${h.name} ${compact((r.delta * h.value_base) / catTotal, cur)}`)
                                  .join(i18n.t('common.listSep'))}
                                {inCat.length > 3 ? ' …' : ''}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="r">{pct(skip ? (r.current_value / plan.final_total) * 100 : r.after_percent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TurnoverNote plan={plan} threshold={threshold} />
          <button
            className="btn small"
            onClick={async () => {
              const lines = plan.rows
                .filter((r) => Math.abs(r.delta) >= threshold)
                .map((r) =>
                  i18n.t('rebalance.copyLine', {
                    name: r.name,
                    action: r.delta > 0 ? i18n.t('rebalance.buy') : i18n.t('rebalance.sell'),
                    amount: money(Math.abs(r.delta), cur, 0),
                    from: pct(r.current_percent),
                    to: pct(r.after_percent),
                  }),
                );
              const text = [
                i18n.t('rebalance.copyTitle', { mode: plan.mode === 'full' ? i18n.t('rebalance.modeFull') : i18n.t('rebalance.modeBuyOnly') }) +
                  (plan.new_money ? i18n.t('rebalance.copyNewMoney', { amount: money(plan.new_money, cur, 0) }) : ''),
                ...lines,
              ].join('\n');
              try {
                await navigator.clipboard.writeText(text);
                toast(i18n.t('rebalance.copied'));
              } catch {
                toast(i18n.t('rebalance.copyFailed'), true);
              }
            }}
          >
            <Icon name="copy" size={14} /> {i18n.t('rebalance.copy')}
          </button>
        </div>
      </div>
    </>
  );
}

function DriftText({ drift, band }: { drift: number; band: number }) {
  const out = Math.abs(drift) > band;
  const text = !out
    ? i18n.t('rebalance.inBand', { drift: `${drift > 0 ? '+' : ''}${drift.toFixed(1)}%` })
    : i18n.t(drift > 0 ? 'rebalance.over' : 'rebalance.under', { drift: `${Math.abs(drift).toFixed(1)}%` });
  return <span style={out ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{text}</span>;
}

function TurnoverNote({ plan, threshold }: { plan: RebalanceData; threshold: number }) {
  const active = plan.rows.filter((r) => Math.abs(r.delta) >= threshold);
  const buy = active.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const sell = active.filter((r) => r.delta < 0).reduce((s, r) => s - r.delta, 0);
  if (plan.target_sum <= 0) return <p className="help">{i18n.t('rebalance.noTargets')}</p>;
  return (
    <p className="help" style={{ marginTop: 12 }}>
      {i18n.t('rebalance.totalBuy', { amount: money(buy, plan.base_currency, 0) })}
      {sell > 0 ? i18n.t('rebalance.totalSell', { amount: money(sell, plan.base_currency, 0) }) : ''}
      {plan.total_value > 0 ? i18n.t('rebalance.turnover', { pct: pct(((buy + sell) / 2 / plan.total_value) * 100) }) : ''}
      {i18n.t('rebalance.disclaimer')}
    </p>
  );
}
