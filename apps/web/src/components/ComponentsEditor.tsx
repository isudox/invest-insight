import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, notifyDataChanged, useApi } from '../api';
import { today } from '../format';
import type { Component } from '@invest-insight/shared';
import { Icon, Modal, useToast } from './ui';

type Row = { symbol: string; name: string; weight: string; sector: string };

const toRow = (c: Component): Row => ({ symbol: c.symbol ?? '', name: c.name, weight: String(c.weight), sector: c.sector ?? '' });
const emptyRow = (): Row => ({ symbol: '', name: '', weight: '', sector: '' });

/**
 * 解析粘贴的成分表，每行一只：代码, 名称, 权重(%), 行业（可选）
 * 支持逗号、制表符（从 Excel / 基金季报复制）或多个空格分隔；无法识别权重的行（如表头）会被跳过。
 */
export function parseComponents(text: string): Row[] {
  const rows: Row[] = [];
  for (const line of text.split(/\r?\n/)) {
    let cells = line
      .split(/\t|,|，|;|；|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) cells = line.trim().split(/\s+/).filter(Boolean);
    if (cells.length < 2) continue;
    const wi = cells.findIndex((c, i) => i > 0 && /^\d+(\.\d+)?%?$/.test(c));
    if (wi < 0) continue;
    const weight = cells[wi].replace('%', '');
    const before = cells.slice(0, wi);
    const sector = cells[wi + 1] ?? '';
    if (before.length >= 2) rows.push({ symbol: before[0], name: before.slice(1).join(' '), weight, sector });
    else rows.push({ symbol: '', name: before[0], weight, sector });
  }
  return rows;
}

export function ComponentsEditor({ assetId, assetName, onClose }: { assetId: number; assetName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data } = useApi<{ as_of: string | null; items: Component[] }>(`/api/assets/${assetId}/components`);
  const [rows, setRows] = useState<Row[]>([]);
  const [asOf, setAsOf] = useState(today());
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRows(data.items.length ? data.items.map(toRow) : [emptyRow()]);
    if (data.as_of) setAsOf(data.as_of);
    if (!data.items.length) setShowPaste(true);
  }, [data]);

  const filled = rows.filter((r) => r.name.trim() && r.weight.trim());
  const sum = filled.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const applyPaste = (mode: 'replace' | 'append') => {
    const parsed = parseComponents(paste);
    if (!parsed.length) {
      setError(t('components.parseError'));
      return;
    }
    setError('');
    setRows(mode === 'replace' ? parsed : [...filled, ...parsed]);
    setPaste('');
    setShowPaste(false);
    toast(t('components.parsed', { count: parsed.length }));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/api/assets/${assetId}/components`, {
        as_of: asOf || null,
        items: filled.map((r) => ({ symbol: r.symbol.trim() || null, name: r.name.trim(), weight: Number(r.weight), sector: r.sector.trim() || null })),
      });
      notifyDataChanged();
      toast(t('components.saved'));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('components.title', { name: assetName })}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="help" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {t('components.summary', { count: filled.length })} <strong style={sum > 100.5 ? { color: 'var(--danger)' } : undefined}>{sum.toFixed(2)}%</strong>
            {sum < 100 && filled.length > 0 ? t('components.remainder', { pct: (100 - sum).toFixed(2) }) : ''}
          </span>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={save} disabled={busy || sum > 100.5}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="filters" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="secondary">{t('components.asOf')}</span>
          <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn small" onClick={() => setShowPaste(!showPaste)}>
          {showPaste ? t('components.collapse') : t('components.paste')}
        </button>
      </div>

      {showPaste && (
        <div className="paste-box">
          <textarea className="input num" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t('components.pastePlaceholder')} />
          <div className="actions" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn small" onClick={() => applyPaste('append')} disabled={!paste.trim()}>
              {t('components.append')}
            </button>
            <button className="btn small primary" onClick={() => applyPaste('replace')} disabled={!paste.trim()}>
              {t('components.replace')}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
        <table className="edit-table">
          <thead>
            <tr>
              <th style={{ width: '20%' }}>{t('components.symbol')}</th>
              <th>{t('common.name')}</th>
              <th style={{ width: 100 }} className="r">
                {t('components.weight')}
              </th>
              <th style={{ width: '22%' }}>{t('components.sector')}</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input className="input" value={r.symbol} onChange={(e) => update(i, { symbol: e.target.value })} placeholder="600519" />
                </td>
                <td>
                  <input className="input" value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={t('common.name')} />
                </td>
                <td>
                  <input
                    className="input num"
                    style={{ textAlign: 'right' }}
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    value={r.weight}
                    onChange={(e) => update(i, { weight: e.target.value })}
                  />
                </td>
                <td>
                  <input className="input" value={r.sector} onChange={(e) => update(i, { sector: e.target.value })} placeholder={t('components.sector')} />
                </td>
                <td>
                  <button className="icon-btn" title={t('common.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Icon name="close" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setRows([...rows, emptyRow()])}>
        <Icon name="plus" size={14} /> {t('components.addRow')}
      </button>
      <p className="help">{t('components.matchHelp')}</p>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
