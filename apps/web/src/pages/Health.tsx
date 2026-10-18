import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, notifyDataChanged, useApi } from '../api';
import { STATUS_COLOR, StatusBadge, useToast } from '../components/ui';
import type { Category, Health, Prefs, RuleStatus } from '@invest-insight/shared';
import i18n from '../i18n';

const ORDER: RuleStatus[] = ['fail', 'warn', 'info', 'pass'];

// 可调阈值：[字段, 名称, 单位, 说明]
// 可调阈值：[字段, 单位类型]，名称与说明见 health.fields.*
const FIELDS: [
  Exclude<keyof Prefs, 'emergency_category_ids' | 'fire_swr' | 'fire_return' | 'fire_monthly_saving'>,
  'pct' | 'band' | 'days' | 'money' | 'months',
][] = [
  ['max_single_asset', 'pct'],
  ['max_single_stock', 'pct'],
  ['max_sector', 'pct'],
  ['max_account', 'pct'],
  ['max_foreign_currency', 'pct'],
  ['rebalance_band', 'band'],
  ['stale_market_days', 'days'],
  ['stale_manual_days', 'days'],
  ['max_fee_ratio', 'pct'],
  ['monthly_expense', 'money'],
  ['emergency_months', 'months'],
];

export function HealthPage() {
  const { data } = useApi<Health>('/api/health');
  const [showPassed, setShowPassed] = useState(true);
  if (!data) return null;

  const counts = ORDER.map((s) => [s, data.results.filter((r) => r.status === s).length] as const);
  const groups = [...new Set(data.results.map((r) => r.group))];
  const score = data.score;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{i18n.t('nav.health')}</h1>
          <p>{i18n.t('health.subtitle')}</p>
        </div>
      </div>

      {data.results.length === 0 ? (
        <div className="card empty">{i18n.t('health.empty')}</div>
      ) : (
        <div className="grid two" style={{ gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', alignItems: 'start' }}>
          <div className="stack">
            <div className="card">
              <div className="score-ring">
                <ScoreRing passed={score?.passed ?? 0} total={score?.total ?? 0} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 650 }}>{score ? i18n.t('health.passed', { passed: score.passed, total: score.total }) : '—'}</div>
                  <div className="actions" style={{ marginTop: 8, gap: 6 }}>
                    {counts
                      .filter(([, n]) => n > 0)
                      .map(([s, n]) => (
                        <StatusBadge key={s} status={s} label={`${i18n.t(`status.${s}`)} ${n}`} />
                      ))}
                  </div>
                </div>
                <label className="secondary" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={showPassed} onChange={(e) => setShowPassed(e.target.checked)} />
                  {i18n.t('health.showPassed')}
                </label>
              </div>
            </div>

            {groups.map((g) => {
              const rules = data.results
                .filter((r) => r.group === g && (showPassed || r.status !== 'pass'))
                .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
              if (!rules.length) return null;
              return (
                <div className="card" key={g}>
                  <div className="card-head" style={{ marginBottom: 0 }}>
                    <h2>{g}</h2>
                  </div>
                  {rules.map((r) => (
                    <div className="rule" key={r.id}>
                      <div>
                        <StatusBadge status={r.status} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="title">{r.title}</div>
                        <div className="msg">{r.message}</div>
                        {r.details && r.details.length > 0 && r.status !== 'pass' && (
                          <ul>
                            {r.details.slice(0, 8).map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                            {r.details.length > 8 && <li>{i18n.t('health.moreItems', { count: r.details.length })}</li>}
                          </ul>
                        )}
                      </div>
                      <div>
                        {r.link && r.status !== 'pass' && (
                          <Link to={r.link} className="btn small">
                            {i18n.t('health.fix')}
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <ThresholdForm prefs={data.prefs} />
        </div>
      )}
    </>
  );
}

function ScoreRing({ passed, total }: { passed: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? passed / total : 0;
  const color = ratio >= 0.85 ? STATUS_COLOR.pass : ratio >= 0.6 ? STATUS_COLOR.warn : STATUS_COLOR.fail;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={i18n.t('health.passed', { passed, total })}>
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
      <circle
        cx="34"
        cy="34"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${c * ratio} ${c}`}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="650" fill="var(--text)">
        {Math.round(ratio * 100)}
      </text>
    </svg>
  );
}

function ThresholdForm({ prefs }: { prefs: Prefs }) {
  const toast = useToast();
  const { data: categories } = useApi<Category[]>('/api/categories');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [cashIds, setCashIds] = useState<number[]>([]);

  useEffect(() => {
    setDraft(Object.fromEntries(FIELDS.map(([k]) => [k, String(prefs[k])])));
    setCashIds(prefs.emergency_category_ids);
  }, [prefs]);

  const save = async () => {
    try {
      const patch: Record<string, number | number[]> = Object.fromEntries(FIELDS.map(([k]) => [k, Number(draft[k]) || 0]));
      patch.emergency_category_ids = cashIds;
      await api.put('/api/prefs', patch);
      notifyDataChanged();
      toast(i18n.t('health.rulesSaved'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>{i18n.t('health.thresholds')}</h2>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {FIELDS.map(([k, unit]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 128px', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13 }}>{i18n.t(`health.fields.${k}.label`)}</div>
              <div className="help">{i18n.t(`health.fields.${k}.help`)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                className="input num"
                style={{ textAlign: 'right' }}
                type="number"
                min={0}
                step="any"
                value={draft[k] ?? ''}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                aria-label={i18n.t(`health.fields.${k}.label`)}
              />
              <span className="muted" style={{ width: 28, fontSize: 12, whiteSpace: 'nowrap' }}>
                {i18n.t(`health.units.${unit}`)}
              </span>
            </div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: 13 }}>{i18n.t('health.cashCategories')}</div>
          <div className="help">{i18n.t('health.cashCategoriesHelp')}</div>
          <div className="actions" style={{ marginTop: 6, gap: 10 }}>
            {categories?.map((c) => (
              <label key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={cashIds.includes(c.id)}
                  onChange={(e) => setCashIds(e.target.checked ? [...cashIds, c.id] : cashIds.filter((x) => x !== c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn primary" onClick={save}>
          {i18n.t('health.saveRules')}
        </button>
      </div>
    </div>
  );
}
