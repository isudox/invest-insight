import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, notifyDataChanged, useApi } from '../api';
import { Icon, Modal, useToast } from '../components/ui';
import { ACCOUNT_TYPE_LIST, accountTypeLabel, money, pct, tone } from '../format';
import type { Account, AccountType, Summary } from '@invest-insight/shared';

export function Accounts() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: accounts } = useApi<Account[]>('/api/accounts');
  const { data: summary } = useApi<Summary>('/api/summary');
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const cur = summary?.base_currency ?? 'CNY';
  const unassigned = summary?.holdings.filter((h) => !h.account_id) ?? [];
  const unassignedValue = unassigned.reduce((s, h) => s + h.value_base, 0);

  const remove = async (a: Account) => {
    if (!confirm(t('accounts.confirmDelete', { name: a.name, count: a.asset_count }))) return;
    await api.del(`/api/accounts/${a.id}`);
    notifyDataChanged();
    toast(t('common.deleted'));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('nav.accounts')}</h1>
          <p>{t('accounts.subtitle')}</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> {t('accounts.add')}
          </button>
        </div>
      </div>

      <div className="card">
        {!accounts?.length ? (
          <div className="empty">{t('accounts.empty')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.account')}</th>
                  <th>{t('common.type')}</th>
                  <th className="r">{t('accounts.assetCount')}</th>
                  <th className="r">{t('common.marketValue')}</th>
                  <th style={{ minWidth: 140 }}>{t('common.shareOfTotal')}</th>
                  <th className="r">{t('dashboard.totalReturn')}</th>
                  <th className="r">{t('common.returnRate')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/holdings?account=${a.id}`} className="asset-name" style={{ color: 'var(--accent)' }}>
                        {a.name}
                      </Link>
                      {a.notes && <div className="asset-sub">{a.notes}</div>}
                    </td>
                    <td className="secondary">{accountTypeLabel(a.type)}</td>
                    <td className="r">{a.asset_count}</td>
                    <td className="r">{money(a.value, cur, 0)}</td>
                    <td>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px', gap: 8, alignItems: 'center' }}>
                        <div className="progress">
                          <span style={{ width: `${a.percent}%`, background: 'var(--accent)' }} />
                        </div>
                        <span className="num" style={{ textAlign: 'right' }}>
                          {pct(a.percent)}
                        </span>
                      </div>
                    </td>
                    <td className={`r ${tone(a.total_return)}`}>{money(a.total_return, cur, 0)}</td>
                    <td className={`r ${tone(a.total_return)}`}>{a.invested > 0 ? pct((a.total_return / a.invested) * 100, 2, true) : '—'}</td>
                    <td>
                      <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                        <button className="icon-btn" title={t('common.edit')} onClick={() => setEditing(a)}>
                          <Icon name="edit" />
                        </button>
                        <button className="icon-btn" title={t('common.delete')} onClick={() => remove(a)}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {unassigned.length > 0 && (
                  <tr>
                    <td className="secondary">{t('common.noAccount')}</td>
                    <td></td>
                    <td className="r">{unassigned.length}</td>
                    <td className="r">{money(unassignedValue, cur, 0)}</td>
                    <td className="secondary">{pct(summary && summary.total_value > 0 ? (unassignedValue / summary.total_value) * 100 : 0)}</td>
                    <td colSpan={3} className="help">
                      {t('accounts.assignHint')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <AccountForm account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'broker');
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body = { name, type, notes: notes || null };
      if (account) await api.put(`/api/accounts/${account.id}`, body);
      else await api.post('/api/accounts', body);
      notifyDataChanged();
      toast(t('common.saved'));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      title={account ? t('accounts.edit') : t('accounts.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" type="submit" form="account-form" disabled={!name.trim()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="account-form" className="form-grid" onSubmit={submit}>
        <div className="field">
          <label>{t('common.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accounts.namePlaceholder')} autoFocus />
        </div>
        <div className="field">
          <label>{t('common.type')}</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPE_LIST.map((k) => (
              <option key={k} value={k}>
                {accountTypeLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>{t('common.notes')}</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('accounts.notesPlaceholder')} />
        </div>
        {error && <div className="form-error full">{error}</div>}
      </form>
    </Modal>
  );
}
