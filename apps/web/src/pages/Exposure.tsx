import { useState } from 'react';
import { useApi } from '../api';
import { ComponentsEditor } from '../components/ComponentsEditor';
import { Icon, Segmented } from '../components/ui';
import { compact, money, pct } from '../format';
import i18n from '../i18n';
import type { Exposure, Holding, SecurityExposure } from '@invest-insight/shared';

// 集中度提示阈值（占总资产）
const SINGLE_WARN = 10;
const SECTOR_WARN = 30;
// 服务端返回的特殊行业键
const UNDISCLOSED = '__undisclosed__';
const UNSET = '__unset__';
const sectorName = (name: string) => (name === UNDISCLOSED ? i18n.t('exposure.undisclosed') : name === UNSET ? i18n.t('exposure.unsetSector') : name);

export function ExposurePage() {
  const { data } = useApi<Exposure>('/api/exposure');
  const { data: holdings } = useApi<Holding[]>('/api/assets');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [scope, setScope] = useState<'overlap' | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  if (!data) return null;
  const cur = data.base_currency;
  const topSecurity = data.securities[0];
  const namedSectors = data.sectors.filter((s) => s.name !== UNDISCLOSED);
  const topSector = namedSectors[0];
  const coverage = data.fund_value > 0 ? (data.disclosed_value / data.fund_value) * 100 : null;

  const rows = data.securities.filter((s) => scope === 'all' || s.overlap);
  const visible = showAll ? rows : rows.slice(0, 20);
  const maxSecurity = Math.max(...data.securities.map((s) => s.percent), 1);
  const maxSector = Math.max(...data.sectors.map((s) => s.percent), 1);

  const fundIds = new Set(data.funds.map((f) => f.asset_id));
  const otherAssets = (holdings ?? []).filter((h) => h.valuation_mode === 'market' && !fundIds.has(h.id));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{i18n.t('nav.exposure')}</h1>
          <p>{i18n.t('exposure.subtitle')}</p>
        </div>
      </div>

      <div className="stack">
        <div className="grid kpis">
          <div className="card kpi">
            <div className="label">{i18n.t('exposure.topStock')}</div>
            <div className={`value ${topSecurity && topSecurity.percent >= SINGLE_WARN ? 'warn-text' : ''}`}>
              {topSecurity ? pct(topSecurity.percent) : '—'}
            </div>
            <div className="sub">
              {topSecurity ? (
                <>
                  {topSecurity.name}
                  {topSecurity.indirect > 0 && topSecurity.direct > 0 && (
                    <> · {i18n.t('exposure.extraViaFunds', { pct: pct(topSecurity.indirect_percent, 2) })}</>
                  )}
                </>
              ) : (
                i18n.t('exposure.noStocks')
              )}
            </div>
          </div>
          <div className="card kpi">
            <div className="label">{i18n.t('exposure.topSector')}</div>
            <div className={`value ${topSector && topSector.percent >= SECTOR_WARN ? 'warn-text' : ''}`}>{topSector ? pct(topSector.percent) : '—'}</div>
            <div className="sub">{topSector ? sectorName(topSector.name) : i18n.t('exposure.noSector')}</div>
          </div>
          <div className="card kpi">
            <div className="label">{i18n.t('exposure.overlapStocks')}</div>
            <div className="value">{data.overlap_count}</div>
            <div className="sub">{i18n.t('exposure.overlapHint')}</div>
          </div>
          <div className="card kpi">
            <div className="label">{i18n.t('exposure.coverage')}</div>
            <div className="value">{coverage === null ? '—' : pct(coverage)}</div>
            <div className="sub">
              {i18n.t('exposure.fundsWithComponents', { count: data.funds.length })}
              {data.missing_funds.length > 0 && <span className="warn-text"> · {i18n.t('exposure.fundsPending', { count: data.missing_funds.length })}</span>}
            </div>
          </div>
        </div>

        {data.missing_funds.length > 0 && (
          <div className="notice">
            <Icon name="alert" />
            <div style={{ flex: 1 }}>
              {i18n.t('exposure.missingNotice')}
              <div className="actions" style={{ marginTop: 8 }}>
                {data.missing_funds.map((f) => (
                  <button key={f.asset_id} className="btn small" onClick={() => setEditing({ id: f.asset_id, name: f.name })}>
                    <Icon name="plus" size={14} /> {f.name}（{compact(f.value, cur)}）
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid two">
          <div className="card">
            <div className="card-head">
              <h2>{i18n.t('exposure.sectors')}</h2>
              <Legend />
            </div>
            {data.sectors.length === 0 ? (
              <div className="empty" style={{ padding: 32 }}>
                {i18n.t('exposure.sectorsEmpty')}
              </div>
            ) : (
              <div>
                {data.sectors.map((s) => (
                  <div
                    key={s.name}
                    className="xbar-row"
                    title={i18n.t('exposure.sectorTip', { name: sectorName(s.name), direct: money(s.direct, cur, 0), indirect: money(s.indirect, cur, 0) })}
                  >
                    <span className={`label ${s.name === UNDISCLOSED || s.name === UNSET ? 'muted' : ''}`}>{sectorName(s.name)}</span>
                    <span className="xbar">
                      {s.name === UNDISCLOSED ? (
                        <span className="rest" style={{ width: `${(s.percent / maxSector) * 100}%` }} />
                      ) : (
                        <>
                          {s.direct > 0 && <span className="direct" style={{ width: `${((s.direct / s.total) * s.percent * 100) / maxSector}%` }} />}
                          {s.indirect > 0 && <span className="fund" style={{ width: `${((s.indirect / s.total) * s.percent * 100) / maxSector}%` }} />}
                        </>
                      )}
                    </span>
                    <span className={`num ${s.percent >= SECTOR_WARN && s.name !== UNDISCLOSED ? 'warn-text' : ''}`} style={{ textAlign: 'right' }}>
                      {pct(s.percent)}
                    </span>
                  </div>
                ))}
                <p className="help" style={{ marginBottom: 0 }}>
                  {i18n.t('exposure.sectorsHelp', { undisclosed: sectorName(UNDISCLOSED) })}
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{i18n.t('exposure.funds')}</h2>
              {otherAssets.length > 0 && (
                <select
                  className="input"
                  style={{ width: 'auto' }}
                  value=""
                  onChange={(e) => {
                    const h = otherAssets.find((x) => x.id === Number(e.target.value));
                    if (h) setEditing({ id: h.id, name: h.name });
                  }}
                >
                  <option value="">{i18n.t('exposure.addForOther')}</option>
                  {otherAssets.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {data.funds.length === 0 ? (
              <div className="empty" style={{ padding: 32 }}>
                {i18n.t('exposure.noFunds')}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{i18n.t('exposure.fund')}</th>
                      <th className="r">{i18n.t('common.marketValue')}</th>
                      <th className="r">{i18n.t('exposure.disclosedWeight')}</th>
                      <th>{i18n.t('exposure.asOf')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.funds.map((f) => (
                      <tr key={f.asset_id}>
                        <td>
                          <div className="asset-name">{f.name}</div>
                          <div className="asset-sub">
                            {f.symbol ? `${f.symbol} · ` : ''}
                            {i18n.t('exposure.componentCount', { count: f.component_count })}
                          </div>
                        </td>
                        <td className="r">{compact(f.value, cur)}</td>
                        <td className="r">{pct(f.disclosed_weight)}</td>
                        <td className="secondary">{f.as_of ?? '—'}</td>
                        <td>
                          <button className="btn small" onClick={() => setEditing({ id: f.asset_id, name: f.name })}>
                            {i18n.t('common.edit')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.fund_overlaps.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '18px 0 8px' }}>{i18n.t('exposure.fundOverlaps')}</h3>
                {data.fund_overlaps.slice(0, 5).map((o) => (
                  <div key={`${o.a}|${o.b}`} style={{ padding: '6px 0', borderTop: '1px solid var(--grid)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>
                        {o.a} ↔ {o.b}
                      </span>
                      <strong className="num">{pct(o.overlap)}</strong>
                    </div>
                    <div className="via-list" style={{ maxWidth: 'none' }}>
                      {i18n.t('exposure.commonHoldings')}
                      {o.common
                        .slice(0, 4)
                        .map((c) => c.name)
                        .join(i18n.t('common.listSep'))}
                      {o.common.length > 4 ? i18n.t('exposure.andMore', { count: o.common.length }) : ''}
                    </div>
                  </div>
                ))}
                <p className="help" style={{ marginBottom: 0 }}>
                  {i18n.t('exposure.overlapHelp')}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>{i18n.t('exposure.stocks')}</h2>
            <div className="actions">
              <Legend />
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: i18n.t('common.all') },
                  { value: 'overlap', label: i18n.t('exposure.overlapOnly', { count: data.overlap_count }) },
                ]}
              />
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: 32 }}>
              {scope === 'overlap' ? i18n.t('exposure.noOverlap') : i18n.t('common.noData')}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{i18n.t('exposure.stock')}</th>
                    <th>{i18n.t('components.sector')}</th>
                    <th className="r">{i18n.t('exposure.direct')}</th>
                    <th className="r">{i18n.t('exposure.viaFunds')}</th>
                    <th style={{ minWidth: 160 }}>{i18n.t('exposure.lookThroughShare')}</th>
                    <th className="r">{i18n.t('exposure.amplification')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <SecurityRow key={s.key} s={s} cur={cur} max={maxSecurity} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 20 && (
            <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setShowAll(!showAll)}>
              {showAll ? i18n.t('components.collapse') : i18n.t('exposure.showAll', { count: rows.length })}
            </button>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
            {i18n.t('exposure.amplificationHelp', { stock: SINGLE_WARN, sector: SECTOR_WARN })}
          </p>
        </div>
      </div>

      {editing && <ComponentsEditor assetId={editing.id} assetName={editing.name} onClose={() => setEditing(null)} />}
    </>
  );
}

function SecurityRow({ s, cur, max }: { s: SecurityExposure; cur: string; max: number }) {
  return (
    <tr className={s.overlap ? 'overlap-row' : undefined}>
      <td>
        <div className="asset-name">{s.name}</div>
        <div className="asset-sub">{s.symbol ?? '—'}</div>
      </td>
      <td className="secondary">{s.sector ?? '—'}</td>
      <td className="r">
        {s.direct > 0 ? (
          <>
            <div>{compact(s.direct, cur)}</div>
            <div className="asset-sub">{pct(s.direct_percent, 2)}</div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="r">
        {s.indirect > 0 ? (
          <>
            <div>{compact(s.indirect, cur)}</div>
            <div className="via-list" style={{ marginLeft: 'auto' }}>
              {s.via.map((v) => `${v.asset_name} ${pct(v.weight, 1)}`).join(i18n.t('common.listSep'))}
            </div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(60px, 1fr) 56px', gap: 8, alignItems: 'center' }}>
          <span className="xbar" title={i18n.t('exposure.stockTip', { direct: money(s.direct, cur, 0), indirect: money(s.indirect, cur, 0) })}>
            {s.direct > 0 && <span className="direct" style={{ width: `${(s.direct_percent / max) * 100}%` }} />}
            {s.indirect > 0 && <span className="fund" style={{ width: `${(s.indirect_percent / max) * 100}%` }} />}
          </span>
          <span className={`num ${s.percent >= SINGLE_WARN ? 'warn-text' : ''}`} style={{ textAlign: 'right', fontWeight: 600 }}>
            {pct(s.percent, 2)}
          </span>
        </div>
      </td>
      <td className="r">{s.amplification && s.amplification > 1.0001 ? <strong>×{s.amplification.toFixed(2)}</strong> : <span className="muted">—</span>}</td>
    </tr>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="dot" style={{ background: 'var(--series-direct)' }} />
        {i18n.t('exposure.direct')}
      </span>
      <span>
        <i className="dot" style={{ background: 'var(--series-fund)' }} />
        {i18n.t('exposure.viaFunds')}
      </span>
    </div>
  );
}
