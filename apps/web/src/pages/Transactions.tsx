import { useState } from 'react';
import { api, notifyDataChanged, useApi } from '../api';
import { CsvImport } from '../components/CsvImport';
import { TxForm } from '../components/forms';
import { Icon, useToast } from '../components/ui';
import { TX_TYPE_LIST, txLabel } from '../format';
import i18n, { currentLang } from '../i18n';
import type { Category, Holding, Transaction } from '@invest-insight/shared';
import { describeTx } from './Holdings';

export function Transactions() {
  const toast = useToast();
  const [assetId, setAssetId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('');
  const qs = new URLSearchParams();
  if (assetId) qs.set('assetId', assetId);
  if (categoryId) qs.set('categoryId', categoryId);
  if (type) qs.set('type', type);
  const { data: txs } = useApi<Transaction[]>(`/api/transactions?${qs}`);
  const { data: holdings } = useApi<Holding[]>('/api/assets?archived=1');
  const { data: categories } = useApi<Category[]>('/api/categories');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const del = async (t: Transaction) => {
    if (!confirm(i18n.t('tx.confirmDelete'))) return;
    await api.del(`/api/transactions/${t.id}`);
    notifyDataChanged();
    toast(i18n.t('common.deleted'));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{i18n.t('nav.transactions')}</h1>
          <p>{i18n.t('tx.subtitle')}</p>
        </div>
        <div className="actions">
          <a className="btn" href={`/api/export/transactions.csv?locale=${currentLang()}`} download>
            {i18n.t('tx.exportCsv')}
          </a>
          <button className="btn" onClick={() => setImporting(true)}>
            {i18n.t('tx.importCsv')}
          </button>
          <button className="btn primary" onClick={() => setEditing('new')} disabled={!holdings?.length}>
            <Icon name="plus" /> {i18n.t('tx.record')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="filters">
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{i18n.t('common.allCategories')}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">{i18n.t('common.allAssets')}</option>
              {holdings
                ?.filter((h) => !categoryId || h.category_id === Number(categoryId))
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{i18n.t('common.allTypes')}</option>
              {TX_TYPE_LIST.map((t) => (
                <option key={t} value={t}>
                  {txLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <span className="hint">{txs ? i18n.t('tx.count', { count: txs.length }) : ''}</span>
        </div>
        {!txs?.length ? (
          <div className="empty">{i18n.t('tx.noMatch')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{i18n.t('common.date')}</th>
                  <th>{i18n.t('common.asset')}</th>
                  <th>{i18n.t('common.type')}</th>
                  <th className="r">{i18n.t('tx.detail')}</th>
                  <th>{i18n.t('common.notes')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{t.date}</td>
                    <td>
                      <i className="dot" style={{ background: t.category_color }} />
                      {t.asset_name}
                      {t.asset_symbol && <span className="muted"> · {t.asset_symbol}</span>}
                    </td>
                    <td>
                      <span className="tag">{txLabel(t.type)}</span>
                    </td>
                    <td className="r">{describeTx(t, t.currency ?? '')}</td>
                    <td className="secondary" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.note}
                    </td>
                    <td>
                      <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                        <button className="icon-btn" title={i18n.t('common.edit')} onClick={() => setEditing(t)}>
                          <Icon name="edit" />
                        </button>
                        <button className="icon-btn" title={i18n.t('common.delete')} onClick={() => del(t)}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && holdings && (
        <TxForm
          holdings={holdings}
          tx={editing === 'new' ? undefined : editing}
          assetId={editing === 'new' && assetId ? Number(assetId) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <CsvImport onClose={() => setImporting(false)} />}
    </>
  );
}
