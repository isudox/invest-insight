import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api, notifyDataChanged, useApi } from '../api';
import { AssetForm, TxForm } from '../components/forms';
import { Icon, Modal, Segmented, useToast } from '../components/ui';
import { compact, money, num, pct, tone, txLabel } from '../format';
import i18n from '../i18n';
import type { Account, Category, Holding, Transaction, TxType } from '@invest-insight/shared';

/** 已清仓：已归档，或按价格估值且数量归零（参考 Ghostfolio / Wealthfolio 的 Active / Closed） */
const isClosed = (h: Holding) => !!h.archived || (h.valuation_mode === 'market' && h.quantity <= 0 && h.tx_count > 0);

export function Holdings() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'closed' ? 'closed' : 'open';
  const accountFilter = params.get('account') ?? '';
  const [query, setQuery] = useState('');
  const { data: all } = useApi<Holding[]>('/api/assets?archived=1');
  const { data: categories } = useApi<Category[]>('/api/categories');
  const { data: accounts } = useApi<Account[]>('/api/accounts');
  const { data: settings } = useApi<{ base_currency: string }>('/api/settings');
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [editing, setEditing] = useState<Holding | 'new' | null>(null);
  const [txFor, setTxFor] = useState<{ asset: Holding; type?: TxType } | null>(null);
  const [detail, setDetail] = useState<Holding | null>(null);
  const cur = settings?.base_currency ?? 'CNY';

  if (!all || !categories) return null;
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const q = query.trim().toLowerCase();
  const holdings = all.filter(
    (h) =>
      (view === 'closed' ? isClosed(h) : !isClosed(h)) &&
      (!accountFilter || String(h.account_id ?? 'none') === accountFilter) &&
      (!q || h.name.toLowerCase().includes(q) || (h.symbol ?? '').toLowerCase().includes(q)),
  );
  const closedCount = all.filter(isClosed).length;
  const total = all.filter((h) => !h.archived).reduce((s, h) => s + h.value_base, 0);
  const groups = categories
    .filter((c) => filter === 'all' || c.id === filter)
    .map((c) => ({ cat: c, items: holdings.filter((h) => h.category_id === c.id).sort((a, b) => b.value_base - a.value_base) }))
    .filter((g) => g.items.length > 0);

  const remove = async (h: Holding) => {
    if (!confirm(t('holdings.confirmDelete', { name: h.name, count: h.tx_count }))) return;
    await api.del(`/api/assets/${h.id}`);
    notifyDataChanged();
    toast(i18n.t('common.deleted'));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('nav.assets')}</h1>
          <p>{t('holdings.subtitle')}</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> {t('holdings.add')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="filters">
            <Segmented
              value={view}
              onChange={(v) => setParam('view', v === 'open' ? '' : v)}
              options={[
                { value: 'open', label: t('holdings.open') },
                { value: 'closed', label: t('holdings.closed', { count: closedCount }) },
              ]}
            />
            <div className="search">
              <Icon name="search" size={14} />
              <input className="input" placeholder={t('holdings.search')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 180 }} />
            </div>
            <select className="input" value={accountFilter} onChange={(e) => setParam('account', e.target.value)}>
              <option value="">{t('common.allAccounts')}</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value="none">{t('common.noAccount')}</option>
            </select>
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{t('common.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <span className="hint">{t('holdings.hint', { currency: cur })}</span>
        </div>

        {groups.length === 0 ? (
          <div className="empty">{all.length === 0 ? t('holdings.empty') : t('holdings.noMatch')}</div>
        ) : view === 'closed' ? (
          <ClosedTable holdings={holdings} cur={cur} onOpen={setDetail} onEdit={setEditing} onRemove={remove} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{i18n.t('common.asset')}</th>
                  <th className="r">{t('holdings.quantity')}</th>
                  <th className="r">{t('holdings.price')}</th>
                  <th className="r">{t('common.marketValue')}</th>
                  <th className="r">{t('holdings.cost')}</th>
                  <th className="r">{t('dashboard.totalReturn')}</th>
                  <th className="r">{t('common.returnRate')}</th>
                  <th className="r">{t('common.share')}</th>
                  <th>{t('holdings.valuedAt')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ cat, items }) => {
                  const v = items.reduce((s, h) => s + h.value_base, 0);
                  const r = items.reduce((s, h) => s + h.total_return_base, 0);
                  return (
                    <Fragment key={cat.id}>
                      <tr className="group-row">
                        <td>
                          <i className="dot" style={{ background: cat.color }} />
                          {cat.name}
                        </td>
                        <td colSpan={2}></td>
                        <td className="r">{money(v, cur, 0)}</td>
                        <td></td>
                        <td className={`r ${tone(r)}`}>{money(r, cur, 0)}</td>
                        <td></td>
                        <td className="r">{pct(total > 0 ? (v / total) * 100 : 0)}</td>
                        <td colSpan={2}></td>
                      </tr>
                      {items.map((h) => (
                        <tr key={h.id} style={h.archived ? { opacity: 0.55 } : undefined}>
                          <td>
                            <a onClick={() => setDetail(h)} style={{ cursor: 'pointer' }}>
                              <div className="asset-name">{h.name}</div>
                              <div className="asset-sub">
                                {[h.symbol, h.account_name, h.currency, h.valuation_mode === 'manual' ? t('holdings.manualValued') : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </a>
                          </td>
                          <td className="r">{h.valuation_mode === 'market' ? num(h.quantity) : '—'}</td>
                          <td className="r">{h.valuation_mode === 'market' ? money(h.price, h.currency) : '—'}</td>
                          <td className="r">
                            <div>{money(h.value_base, cur, 0)}</div>
                            {h.currency !== cur && <div className="asset-sub">{money(h.value, h.currency, 0)}</div>}
                          </td>
                          <td className="r">{money(h.cost_base, cur, 0)}</td>
                          <td className={`r ${tone(h.total_return_base)}`}>
                            <div>{money(h.total_return_base, cur, 0)}</div>
                            {h.currency !== cur && h.value_base > 0 && (
                              <div className="asset-sub" title={t('holdings.attributionHint')}>
                                {t('holdings.attribution', { price: compact(h.price_pnl_base, cur), fx: compact(h.fx_pnl_base, cur) })}
                              </div>
                            )}
                          </td>
                          <td className={`r ${tone(h.return_percent)}`}>{pct(h.return_percent, 2, true)}</td>
                          <td className="r">{pct(h.weight_percent)}</td>
                          <td className="secondary">{h.last_price_date ?? '—'}</td>
                          <td>
                            <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                              <button className="btn small" onClick={() => setTxFor({ asset: h, type: 'valuation' })}>
                                {t('holdings.updateValuation')}
                              </button>
                              <button className="btn small ghost" onClick={() => setTxFor({ asset: h })}>
                                {t('tx.record')}
                              </button>
                              <button className="icon-btn" title={i18n.t('common.edit')} onClick={() => setEditing(h)}>
                                <Icon name="edit" />
                              </button>
                              <button className="icon-btn" title={i18n.t('common.delete')} onClick={() => remove(h)}>
                                <Icon name="trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <AssetForm
          asset={editing === 'new' ? undefined : editing}
          defaultCategoryId={filter === 'all' ? undefined : filter}
          defaultAccountId={accountFilter && accountFilter !== 'none' ? Number(accountFilter) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {txFor && <TxForm holdings={all} assetId={txFor.asset.id} defaultType={txFor.type} onClose={() => setTxFor(null)} />}
      {detail && <AssetDetail holding={detail} holdings={all} base={cur} onClose={() => setDetail(null)} />}
    </>
  );
}

function ClosedTable({
  holdings,
  cur,
  onOpen,
  onEdit,
  onRemove,
}: {
  holdings: Holding[];
  cur: string;
  onOpen: (h: Holding) => void;
  onEdit: (h: Holding) => void;
  onRemove: (h: Holding) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{i18n.t('common.asset')}</th>
            <th>{i18n.t('common.category')}</th>
            <th className="r">{i18n.t('holdings.invested')}</th>
            <th className="r">{i18n.t('holdings.realized')}</th>
            <th className="r">{i18n.t('holdings.income')}</th>
            <th className="r">{i18n.t('holdings.totalReturnRate')}</th>
            <th>{i18n.t('holdings.lastValued')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {[...holdings]
            .sort((a, b) => b.total_return_base - a.total_return_base)
            .map((h) => (
              <tr key={h.id}>
                <td>
                  <a onClick={() => onOpen(h)} style={{ cursor: 'pointer' }}>
                    <div className="asset-name">{h.name}</div>
                    <div className="asset-sub">{[h.symbol, h.account_name, h.archived ? i18n.t('holdings.archived') : null].filter(Boolean).join(' · ')}</div>
                  </a>
                </td>
                <td>
                  <i className="dot" style={{ background: h.category_color }} />
                  {h.category_name}
                </td>
                <td className="r">{money(h.invested_base, cur, 0)}</td>
                <td className={`r ${tone(h.realized_base)}`}>{money(h.realized_base, cur, 0)}</td>
                <td className={`r ${tone(h.income_base)}`}>{money(h.income_base, cur, 0)}</td>
                <td className={`r ${tone(h.return_percent)}`}>{pct(h.return_percent, 2, true)}</td>
                <td className="secondary">{h.last_price_date ?? '—'}</td>
                <td>
                  <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                    <button className="icon-btn" title={i18n.t('common.edit')} onClick={() => onEdit(h)}>
                      <Icon name="edit" />
                    </button>
                    <button className="icon-btn" title={i18n.t('common.delete')} onClick={() => onRemove(h)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetDetail({ holding, holdings, base, onClose }: { holding: Holding; holdings: Holding[]; base: string; onClose: () => void }) {
  const toast = useToast();
  const { data } = useApi<Holding & { transactions: Transaction[] }>(`/api/assets/${holding.id}`);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const h = data ?? holding;
  const c = h.currency;

  const del = async (t: Transaction) => {
    if (!confirm(i18n.t('tx.confirmDelete'))) return;
    await api.del(`/api/transactions/${t.id}`);
    notifyDataChanged();
    toast(i18n.t('common.deleted'));
  };

  return (
    <Modal
      title={`${h.name}${h.symbol ? ` · ${h.symbol}` : ''}`}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          {i18n.t('common.close')}
        </button>
      }
    >
      <div className="grid half" style={{ marginBottom: 16, gap: 8 }}>
        <div>
          <div className="muted">{i18n.t('holdings.currentValue')}</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{money(h.value, c)}</div>
        </div>
        <div>
          <div className="muted">{i18n.t('dashboard.totalReturn')}</div>
          <div style={{ fontSize: 18, fontWeight: 600 }} className={tone(h.total_return_base)}>
            {pct(h.return_percent, 2, true)}
          </div>
        </div>
      </div>
      {h.fx_rate !== 1 && h.value_base > 0 && (
        <div className="kv" style={{ marginTop: 0, marginBottom: 12 }}>
          <div>
            <div className="k">{i18n.t('holdings.costAtTradeFx')}</div>
            <div className="v num">{compact(h.cost_base, base)}</div>
          </div>
          <div>
            <div className="k">{i18n.t('holdings.pricePnl')}</div>
            <div className={`v num ${tone(h.price_pnl_base)}`}>{compact(h.price_pnl_base, base)}</div>
          </div>
          <div>
            <div className="k">{i18n.t('holdings.fxPnl')}</div>
            <div className={`v num ${tone(h.fx_pnl_base)}`}>{compact(h.fx_pnl_base, base)}</div>
          </div>
        </div>
      )}
      {h.fx_estimated_count > 0 && <p className="help warn-text">{i18n.t('holdings.fxEstimated', { count: h.fx_estimated_count })}</p>}
      {h.notes && <p className="secondary">{h.notes}</p>}
      <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>{i18n.t('common.date')}</th>
              <th>{i18n.t('common.type')}</th>
              <th className="r">{i18n.t('tx.detail')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.transactions.map((t) => (
              <tr key={t.id}>
                <td className="num">{t.date}</td>
                <td>
                  <span className="tag">{txLabel(t.type)}</span>
                </td>
                <td className="r">{describeTx(t, c)}</td>
                <td>
                  <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                    <button className="icon-btn" title={i18n.t('common.edit')} onClick={() => setEditTx(t)}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button className="icon-btn" title={i18n.t('common.delete')} onClick={() => del(t)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editTx && <TxForm holdings={holdings} tx={editTx} onClose={() => setEditTx(null)} />}
    </Modal>
  );
}

export function describeTx(t: Transaction, c: string) {
  // 外币交易附上成交汇率
  const fx = t.fx_rate != null && t.fx_base && c && c !== t.fx_base && t.type !== 'valuation' ? ` · ${i18n.t('tx.fxIs', { rate: t.fx_rate })}` : '';
  if (t.type === 'buy' || t.type === 'sell')
    return `${num(t.quantity)} × ${money(t.price, c)}${t.fee ? ` · ${i18n.t('tx.feeShort', { fee: money(t.fee, c) })}` : ''}${fx}`;
  if (t.type === 'valuation') return t.price != null ? i18n.t('tx.priceIs', { price: money(t.price, c) }) : i18n.t('tx.valueIs', { value: money(t.amount, c) });
  return money(t.amount, c) + fx;
}
