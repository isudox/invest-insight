import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Account, Category, CsvImportPreview, CsvImportResult } from '@invest-insight/shared';
import { api, notifyDataChanged, useApi } from '../api';
import { txLabel } from '../format';
import { currentLang } from '../i18n';
import { Icon, Modal, useToast } from './ui';

/** CSV 模板：表头与示例行按当前界面语言生成，导入时中英文表头都能识别 */
function templateCsv(): string {
  const zh = currentLang() === 'zh-CN';
  const rows = zh
    ? [
        ['日期', '类型', '资产', '代码', '账户', '类别', '币种', '数量', '价格', '金额', '手续费', '成交汇率', '备注'],
        ['2026-01-05', '买入', 'Apple', 'AAPL', '富途证券', '股票', 'USD', '10', '230.5', '', '1', '7.15', ''],
        ['2026-03-20', '分红/利息', 'Apple', 'AAPL', '', '', '', '', '', '2.4', '', '7.18', ''],
        ['2026-02-01', '存入/缴费', '年金险', '', '平安保险', '保险', 'CNY', '', '', '50000', '', '', '年度缴费'],
      ]
    : [
        ['date', 'type', 'asset', 'symbol', 'account', 'category', 'currency', 'quantity', 'price', 'amount', 'fee', 'fx_rate', 'note'],
        ['2026-01-05', 'buy', 'Apple', 'AAPL', 'Brokerage', 'Stocks', 'USD', '10', '230.5', '', '1', '', ''],
        ['2026-03-20', 'income', 'Apple', 'AAPL', '', '', '', '', '', '2.4', '', '', ''],
        ['2026-02-01', 'deposit', 'Annuity', '', 'Insurer', 'Insurance', 'USD', '', '', '5000', '', '', 'Annual premium'],
      ];
  return '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}

export function CsvImport({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: categories } = useApi<Category[]>('/api/categories');
  const { data: accounts } = useApi<Account[]>('/api/accounts');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [createMissing, setCreateMissing] = useState(true);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const body = () => ({
    csv,
    create_missing: createMissing,
    default_category_id: categoryId === '' ? (categories?.[0]?.id ?? null) : categoryId,
    default_account_id: accountId === '' ? null : accountId,
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doPreview = () => run(async () => setPreview(await api.post<CsvImportPreview>('/api/import/csv/preview', body())));
  const doCommit = () =>
    run(async () => {
      const r = await api.post<CsvImportResult>('/api/import/csv/commit', body());
      notifyDataChanged();
      toast(t('csv.done', { imported: r.imported, skipped: r.skipped }));
      onClose();
    });

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invest-insight-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = preview ? preview.rows.filter((r) => !onlyIssues || r.status !== 'ok' || r.new_asset) : [];

  return (
    <Modal
      title={t('csv.title')}
      onClose={onClose}
      wide
      footer={
        preview ? (
          <>
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
              {t('csv.back')}
            </button>
            <button className="btn primary" onClick={doCommit} disabled={busy || preview.counts.ok === 0}>
              {t('csv.importN', { count: preview.counts.ok })}
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" onClick={doPreview} disabled={busy || !csv.trim()}>
              {t('csv.preview')}
            </button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="help" style={{ margin: 0 }}>
            {t('csv.intro')}{' '}
            <a style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={downloadTemplate}>
              {t('csv.template')}
            </a>
          </p>
          <div className="actions">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={14} /> {t('csv.chooseFile')}
            </button>
            {fileName && <span className="secondary">{fileName}</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFileName(f.name);
                  setCsv(await f.text());
                }
                e.target.value = '';
              }}
            />
          </div>
          <textarea
            className="input num"
            rows={8}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName('');
            }}
            placeholder={t('csv.pastePlaceholder')}
          />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
            {t('csv.createMissing')}
          </label>
          {createMissing && (
            <div className="form-grid">
              <div className="field">
                <label>{t('csv.defaultCategory')}</label>
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('csv.defaultAccount')}</label>
                <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">{t('forms.unassigned')}</option>
                  {accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="actions" style={{ gap: 6 }}>
            <span className="status-badge pass">
              <Icon name="checkCircle" size={14} />
              {t('csv.ok', { count: preview.counts.ok })}
            </span>
            <span className="status-badge info">
              <Icon name="info" size={14} />
              {t('csv.duplicates', { count: preview.counts.duplicate })}
            </span>
            <span className="status-badge fail">
              <Icon name="x" size={14} />
              {t('csv.errors', { count: preview.counts.error })}
            </span>
            <label className="secondary" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
              {t('csv.onlyIssues')}
            </label>
          </div>
          {(preview.new_assets.length > 0 || preview.new_accounts.length > 0) && (
            <div className="notice">
              <Icon name="info" />
              <div>
                {preview.new_assets.length > 0 && (
                  <div>
                    {t('csv.newAssets', { count: preview.new_assets.length })}
                    {preview.new_assets.map((a) => `${a.name}（${a.currency} · ${a.category}${a.account ? ` · ${a.account}` : ''}）`).join(t('common.listSep'))}
                  </div>
                )}
                {preview.new_accounts.length > 0 && <div>{t('csv.newAccounts', { list: preview.new_accounts.join(t('common.listSep')) })}</div>}
              </div>
            </div>
          )}
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th className="r">{t('csv.line')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.type')}</th>
                  <th>{t('common.asset')}</th>
                  <th className="r">{t('tx.detail')}</th>
                  <th>{t('csv.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="r muted">{r.line}</td>
                    <td className="num">{r.date ?? '—'}</td>
                    <td>{r.type ? txLabel(r.type) : '—'}</td>
                    <td>
                      {r.asset}
                      {r.symbol ? <span className="muted"> · {r.symbol}</span> : null}
                      {r.new_asset && (
                        <span className="tag" style={{ marginLeft: 6 }}>
                          {t('csv.new')}
                        </span>
                      )}
                    </td>
                    <td className="r num">
                      {r.quantity ? `${r.quantity} × ${r.price}` : (r.amount ?? r.price ?? '')}
                      {r.fx_rate ? <span className="muted"> @ {r.fx_rate}</span> : null}
                    </td>
                    <td style={{ whiteSpace: 'normal', minWidth: 180 }}>
                      {r.status === 'ok' ? (
                        <span className="status-badge pass">{t('csv.statusOk')}</span>
                      ) : (
                        <span className={r.status === 'error' ? 'form-error' : 'muted'} style={{ fontSize: 12 }}>
                          {r.message}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center' }}>
                      {t('csv.noIssues')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="help" style={{ margin: 0 }}>
            {t('csv.commitHelp')}
          </p>
        </div>
      )}
      {error && (
        <div className="form-error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
