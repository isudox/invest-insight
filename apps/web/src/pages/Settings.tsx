import { useEffect, useRef, useState } from 'react';
import { api, notifyDataChanged, useApi } from '../api';
import { Icon, Segmented, useToast } from '../components/ui';
import { dateTime, PALETTE } from '../format';
import i18n, { LANGUAGES, setLanguage, type Lang } from '../i18n';
import type { BackupInfo, Category, Meta, Settings as SettingsData } from '@invest-insight/shared';

export function Settings() {
  const toast = useToast();
  const { data: settings } = useApi<SettingsData>('/api/settings');
  const { data: categories } = useApi<Category[]>('/api/categories');
  const [base, setBase] = useState('CNY');
  const [rates, setRates] = useState<[string, string][]>([]);
  const [pnl, setPnl] = useState(() => readPref('pnl', 'cn'));
  const [theme, setTheme] = useState(() => readPref('theme', 'system'));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settings) return;
    setBase(settings.base_currency);
    setRates(Object.entries(settings.fx_rates).map(([c, r]) => [c, String(r)]));
  }, [settings]);

  const saveFx = async () => {
    try {
      await api.put('/api/settings', {
        base_currency: base,
        fx_rates: Object.fromEntries(rates.filter(([c]) => c.trim()).map(([c, r]) => [c.trim().toUpperCase(), Number(r)])),
      });
      notifyDataChanged();
      toast(i18n.t('settings.ratesSaved'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const importFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (!confirm(i18n.t('settings.confirmImport'))) return;
      await api.post('/api/import', json);
      notifyDataChanged();
      toast(i18n.t('settings.imported'));
    } catch (e) {
      toast(i18n.t('settings.importFailed', { message: (e as Error).message }), true);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{i18n.t('nav.settings')}</h1>
          <p>{i18n.t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="grid half">
        <div className="stack">
          <CategoryEditor categories={categories ?? []} />

          <div className="card">
            <div className="card-head">
              <h2>{i18n.t('settings.display')}</h2>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>{i18n.t('settings.language')}</span>
                <Segmented value={i18n.language as Lang} onChange={(v) => setLanguage(v)} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>{i18n.t('settings.pnlColors')}</span>
                <Segmented
                  value={pnl}
                  onChange={(v) => {
                    setPnl(v);
                    writePref('pnl', v);
                    applyPrefs();
                  }}
                  options={[
                    { value: 'cn', label: i18n.t('settings.pnlCn') },
                    { value: 'west', label: i18n.t('settings.pnlWest') },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>{i18n.t('settings.theme')}</span>
                <Segmented
                  value={theme}
                  onChange={(v) => {
                    setTheme(v);
                    writePref('theme', v);
                    applyPrefs();
                  }}
                  options={[
                    { value: 'system', label: i18n.t('settings.themeSystem') },
                    { value: 'light', label: i18n.t('settings.themeLight') },
                    { value: 'dark', label: i18n.t('settings.themeDark') },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>{i18n.t('settings.fx')}</h2>
              <span className="hint">{i18n.t('settings.fxHint')}</span>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{i18n.t('settings.baseCurrency')}</label>
              <select className="input" value={base} onChange={(e) => setBase(e.target.value)}>
                {rates.map(([c]) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <table>
              <tbody>
                {rates.map(([c, r], i) => (
                  <tr key={i}>
                    <td style={{ width: 120 }}>
                      <input
                        className="input"
                        value={c}
                        onChange={(e) => setRates(rates.map((x, j) => (j === i ? [e.target.value.toUpperCase(), x[1]] : x)))}
                        placeholder={i18n.t('settings.currency')}
                      />
                    </td>
                    <td>
                      <input
                        className="input num"
                        type="number"
                        step="any"
                        min={0}
                        value={c === base ? '1' : r}
                        disabled={c === base}
                        onChange={(e) => setRates(rates.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
                      />
                    </td>
                    <td style={{ width: 40 }}>
                      {c !== base && (
                        <button className="icon-btn" title={i18n.t('common.remove')} onClick={() => setRates(rates.filter((_, j) => j !== i))}>
                          <Icon name="close" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="actions" style={{ marginTop: 12, justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => setRates([...rates, ['', '1']])}>
                <Icon name="plus" /> {i18n.t('settings.addCurrency')}
              </button>
              <button className="btn primary" onClick={saveFx}>
                {i18n.t('settings.saveRates')}
              </button>
            </div>
            <p className="help">{i18n.t('settings.fxHelp')}</p>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{i18n.t('settings.data')}</h2>
            </div>
            <p className="secondary" style={{ marginTop: 0 }}>
              {i18n.t('settings.dataLocation')}
              <br />
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{settings?.db_path}</code>
            </p>
            <p className="help">{i18n.t('settings.dataHelp')}</p>
            <div className="actions">
              <a className="btn" href="/api/export" download>
                {i18n.t('settings.export')}
              </a>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                {i18n.t('settings.import')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="actions" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
              <button
                className="btn"
                onClick={async () => {
                  if (!confirm(i18n.t('settings.confirmDemo'))) return;
                  await api.post('/api/demo');
                  notifyDataChanged();
                  toast(i18n.t('settings.demoLoaded'));
                }}
              >
                {i18n.t('settings.loadDemo')}
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm(i18n.t('settings.confirmClear'))) return;
                  await api.del('/api/data');
                  notifyDataChanged();
                  toast(i18n.t('settings.cleared'));
                }}
              >
                {i18n.t('settings.clear')}
              </button>
            </div>
          </div>

          <BackupsCard />
        </div>
      </div>
    </>
  );
}

function BackupsCard() {
  const toast = useToast();
  const { data: backups, reload } = useApi<BackupInfo[]>('/api/backups');
  const { data: meta } = useApi<Meta>('/api/meta');
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <div className="card-head">
        <h2>{i18n.t('settings.snapshots')}</h2>
        <button
          className="btn small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/api/backups');
              reload();
              toast(i18n.t('settings.snapshotCreated'));
            } catch (e) {
              toast((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {i18n.t('settings.backupNow')}
        </button>
      </div>
      <p className="help" style={{ marginTop: 0 }}>
        {meta?.backup_cron ? i18n.t('settings.backupSchedule', { cron: meta.backup_cron, keep: meta.backup_keep }) : i18n.t('settings.backupOff')}
        {i18n.t('settings.backupHelp')}
      </p>
      {!backups?.length ? (
        <div className="help">{i18n.t('settings.noSnapshots')}</div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table>
            <tbody>
              {backups.slice(0, 30).map((b) => (
                <tr key={b.name}>
                  <td>
                    <div style={{ fontSize: 13 }}>{dateTime(b.created_at)}</div>
                    <div className="asset-sub">{b.name}</div>
                  </td>
                  <td>
                    <span className="tag">{i18n.t(`settings.backupKinds.${b.kind}`)}</span>
                  </td>
                  <td className="r secondary">{(b.size / 1024).toFixed(0)} KB</td>
                  <td>
                    <a className="btn small ghost" href={`/api/backups/${encodeURIComponent(b.name)}`} download>
                      {i18n.t('settings.download')}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && (
        <p className="help" style={{ marginBottom: 0 }}>
          {i18n.t('settings.version', { version: meta.version, schema: meta.schema_version, node: meta.node })}
        </p>
      )}
    </div>
  );
}

function CategoryEditor({ categories }: { categories: Category[] }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<number, { name: string; color: string }>>({});
  const [newName, setNewName] = useState('');

  useEffect(() => {
    setDraft(Object.fromEntries(categories.map((c) => [c.id, { name: c.name, color: c.color }])));
  }, [categories]);

  const save = async (c: Category) => {
    const d = draft[c.id];
    try {
      await api.put(`/api/categories/${c.id}`, { ...d, target_percent: c.target_percent });
      notifyDataChanged();
      toast(i18n.t('common.saved'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const add = async () => {
    const used = new Set(categories.map((c) => c.color));
    const color = PALETTE.find((p) => !used.has(p)) ?? PALETTE[PALETTE.length - 1];
    try {
      await api.post('/api/categories', { name: newName.trim(), color, target_percent: 0 });
      setNewName('');
      notifyDataChanged();
      toast(i18n.t('settings.categoryAdded'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const remove = async (c: Category) => {
    if (!confirm(i18n.t('settings.confirmDeleteCategory', { name: c.name }))) return;
    try {
      await api.del(`/api/categories/${c.id}`);
      notifyDataChanged();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>{i18n.t('settings.categories')}</h2>
        <span className="hint">{i18n.t('settings.categoriesHint')}</span>
      </div>
      <table>
        <tbody>
          {categories.map((c) => {
            const d = draft[c.id] ?? { name: c.name, color: c.color };
            const changed = d.name !== c.name || d.color !== c.color;
            return (
              <tr key={c.id}>
                <td style={{ width: 48 }}>
                  <input
                    type="color"
                    value={d.color}
                    onChange={(e) => setDraft({ ...draft, [c.id]: { ...d, color: e.target.value } })}
                    style={{ width: 32, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                    aria-label={i18n.t('settings.colorOf', { name: c.name })}
                  />
                </td>
                <td>
                  <input className="input" value={d.name} onChange={(e) => setDraft({ ...draft, [c.id]: { ...d, name: e.target.value } })} />
                </td>
                <td style={{ width: 110, textAlign: 'right' }}>
                  {changed ? (
                    <button className="btn small primary" onClick={() => save(c)}>
                      {i18n.t('common.save')}
                    </button>
                  ) : (
                    <button className="icon-btn" title={i18n.t('common.delete')} onClick={() => remove(c)}>
                      <Icon name="trash" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="actions" style={{ marginTop: 12 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          placeholder={i18n.t('settings.newCategory')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && newName.trim() && add()}
        />
        <button className="btn" onClick={add} disabled={!newName.trim()}>
          <Icon name="plus" /> {i18n.t('common.add')}
        </button>
      </div>
    </div>
  );
}

// ---------- 本地显示偏好（仅影响当前浏览器） ----------

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`ii.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`ii.${key}`, value);
  } catch {
    /* 忽略 */
  }
}

export function applyPrefs() {
  const root = document.documentElement;
  const theme = readPref('theme', 'system');
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-pnl', readPref('pnl', 'cn'));
}
