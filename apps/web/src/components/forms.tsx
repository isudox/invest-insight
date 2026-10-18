import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, notifyDataChanged, useApi } from '../api';
import { num, today, txLabel } from '../format';
import type { Account, Category, Exposure, Holding, Settings, Transaction, TxType, ValuationMode } from '@invest-insight/shared';
import { Modal, Segmented, useToast } from './ui';

// 金额以字符串提交，由服务端按十进制精确解析
const numOrNull = (s: string) => (s.trim() === '' ? null : s.trim());

// ---------- 新增 / 编辑资产 ----------

export function AssetForm({
  asset,
  defaultCategoryId,
  defaultAccountId,
  onClose,
}: {
  asset?: Holding;
  defaultCategoryId?: number;
  defaultAccountId?: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: categories } = useApi<Category[]>('/api/categories');
  const { data: settings } = useApi<Settings>('/api/settings');
  const [name, setName] = useState(asset?.name ?? '');
  const [symbol, setSymbol] = useState(asset?.symbol ?? '');
  const [categoryId, setCategoryId] = useState<number | ''>(asset?.category_id ?? defaultCategoryId ?? '');
  const [currency, setCurrency] = useState(asset?.currency ?? 'CNY');
  const [mode, setMode] = useState<ValuationMode>(asset?.valuation_mode ?? 'market');
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const [sector, setSector] = useState(asset?.sector ?? '');
  const { data: accounts } = useApi<Account[]>('/api/accounts');
  const [accountId, setAccountId] = useState<number | ''>(asset?.account_id ?? defaultAccountId ?? '');
  const { data: exposure } = useApi<Exposure>('/api/exposure');
  const knownSectors = [...new Set((exposure?.sectors ?? []).map((s) => s.name).filter((n) => !n.startsWith('__')))];
  const [archived, setArchived] = useState(!!asset?.archived);
  const [initDate, setInitDate] = useState(today());
  const [initQty, setInitQty] = useState('');
  const [initPrice, setInitPrice] = useState('');
  const [initAmount, setInitAmount] = useState('');
  const [initFx, setInitFx] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const catId = categoryId === '' ? categories?.[0]?.id : categoryId;
  const currencies = Object.keys(settings?.fx_rates ?? { CNY: 1 });
  const initFxNeeded = !asset && !!settings && currency !== settings.base_currency;
  const initFxValue = initFx ?? (settings?.fx_rates[currency] != null ? String(settings.fx_rates[currency]) : '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name,
      symbol: symbol || null,
      category_id: catId,
      currency,
      valuation_mode: mode,
      notes: notes || null,
      sector: sector.trim() || null,
      account_id: accountId === '' ? null : accountId,
      archived,
    };
    try {
      if (asset) {
        await api.put(`/api/assets/${asset.id}`, payload);
      } else {
        const fx_rate = initFxNeeded ? (numOrNull(initFxValue) ?? undefined) : undefined;
        const initial =
          mode === 'market' && initQty && initPrice
            ? { date: initDate, quantity: initQty.trim(), price: initPrice.trim(), fx_rate }
            : mode === 'manual' && initAmount
              ? { date: initDate, amount: initAmount.trim(), fx_rate }
              : undefined;
        await api.post('/api/assets', { ...payload, initial });
      }
      notifyDataChanged();
      toast(asset ? t('forms.assetUpdated') : t('forms.assetAdded'));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={asset ? t('forms.editAsset') : t('holdings.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" type="submit" form="asset-form" disabled={busy || !name}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="asset-form" className="form-grid" onSubmit={submit}>
        <div className="field">
          <label>{t('common.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('forms.namePlaceholder')} autoFocus required />
        </div>
        <div className="field">
          <label>{t('forms.symbol')}</label>
          <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="600519 / AAPL / BTC" />
        </div>
        <div className="field">
          <label>{t('forms.category')}</label>
          <select className="input" value={catId ?? ''} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('forms.currency')}</label>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>{t('forms.account')}</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">{t('forms.unassigned')}</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>{t('forms.valuationMode')}</label>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'market', label: t('forms.modeMarket') },
              { value: 'manual', label: t('forms.modeManual') },
            ]}
          />
          <span className="help">{mode === 'market' ? t('forms.modeMarketHelp') : t('forms.modeManualHelp')}</span>
        </div>

        {!asset && (
          <>
            <div className="field">
              <label>{t('forms.initialDate')}</label>
              <input className="input" type="date" value={initDate} onChange={(e) => setInitDate(e.target.value)} />
            </div>
            {mode === 'market' ? (
              <>
                <div className="field">
                  <label>{t('forms.initialQty')}</label>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    min="0"
                    value={initQty}
                    onChange={(e) => setInitQty(e.target.value)}
                    placeholder={t('forms.later')}
                  />
                </div>
                <div className="field">
                  <label>{t('forms.avgPrice', { currency })}</label>
                  <input className="input" type="number" step="any" min="0" value={initPrice} onChange={(e) => setInitPrice(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="field">
                <label>{t('forms.investedAmount', { currency })}</label>
                <input
                  className="input"
                  type="number"
                  step="any"
                  min="0"
                  value={initAmount}
                  onChange={(e) => setInitAmount(e.target.value)}
                  placeholder={t('forms.later')}
                />
              </div>
            )}
            {initFxNeeded && (
              <div className="field">
                <label>{t('forms.fxRate', { currency, base: settings?.base_currency })}</label>
                <input className="input" type="number" step="any" min="0" value={initFxValue} onChange={(e) => setInitFx(e.target.value)} />
                <span className="help">{t('forms.fxRateHelp')}</span>
              </div>
            )}
          </>
        )}

        {mode === 'market' && (
          <div className="field full">
            <label>{t('forms.sector')}</label>
            <input
              className="input"
              list="sector-options"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder={t('forms.sectorPlaceholder')}
            />
            <datalist id="sector-options">
              {knownSectors.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <span className="help">{t('forms.sectorHelp')}</span>
          </div>
        )}
        <div className="field full">
          <label>{t('common.notes')}</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {asset && (
          <label className="full" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            {t('forms.archive')}
          </label>
        )}
        {error && <div className="form-error full">{error}</div>}
      </form>
    </Modal>
  );
}

// ---------- 记一笔交易 ----------

const MARKET_TYPES: TxType[] = ['buy', 'sell', 'valuation', 'income'];
const MANUAL_TYPES: TxType[] = ['deposit', 'withdraw', 'valuation', 'income'];

export function TxForm({
  holdings,
  assetId,
  defaultType,
  tx,
  onClose,
}: {
  holdings: Holding[];
  assetId?: number;
  defaultType?: TxType;
  tx?: Transaction;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [selected, setSelected] = useState<number>(tx?.asset_id ?? assetId ?? holdings[0]?.id);
  const asset = holdings.find((h) => h.id === selected);
  const mode = asset?.valuation_mode ?? 'market';
  const types = mode === 'market' ? MARKET_TYPES : MANUAL_TYPES;
  const [type, setType] = useState<TxType>(tx?.type ?? defaultType ?? types[0]);
  const effectiveType = types.includes(type) ? type : types[0];
  const [date, setDate] = useState(tx?.date ?? today());
  const [quantity, setQuantity] = useState(tx?.quantity?.toString() ?? '');
  const [price, setPrice] = useState(tx?.price?.toString() ?? (defaultType === 'valuation' && asset?.price ? String(asset.price) : ''));
  const [amount, setAmount] = useState(tx?.amount?.toString() ?? (defaultType === 'valuation' && mode === 'manual' && asset ? String(asset.value) : ''));
  const [fee, setFee] = useState(tx?.fee ? String(tx.fee) : '');
  const { data: settings } = useApi<Settings>('/api/settings');
  const base = settings?.base_currency;
  const [fx, setFx] = useState<string | null>(tx?.fx_rate != null ? String(tx.fx_rate) : null);
  const [note, setNote] = useState(tx?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const needsQty = effectiveType === 'buy' || effectiveType === 'sell';
  const needsPrice = needsQty || (effectiveType === 'valuation' && mode === 'market');
  const needsAmount = !needsPrice;
  const cur = asset?.currency ?? '';
  // 外币交易需要成交汇率：默认填入当前汇率，可按成交单修改
  const needsFx = !!asset && !!base && cur !== base && effectiveType !== 'valuation';
  const fxValue = fx ?? (settings?.fx_rates[cur] != null ? String(settings.fx_rates[cur]) : '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      asset_id: selected,
      type: effectiveType,
      date,
      quantity: needsQty ? numOrNull(quantity) : null,
      price: needsPrice ? numOrNull(price) : null,
      amount: needsAmount ? numOrNull(amount) : null,
      fee: needsQty ? fee.trim() || '0' : '0',
      fx_rate: needsFx ? numOrNull(fxValue) : null,
      note: note || null,
    };
    try {
      if (tx) await api.put(`/api/transactions/${tx.id}`, payload);
      else await api.post('/api/transactions', payload);
      notifyDataChanged();
      toast(t('forms.recorded'));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={tx ? t('forms.editTx') : t('tx.record')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" type="submit" form="tx-form" disabled={busy || !asset}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="tx-form" className="form-grid" onSubmit={submit}>
        <div className="field full">
          <label>{t('common.asset')}</label>
          <select className="input" value={selected} onChange={(e) => setSelected(Number(e.target.value))} disabled={!!assetId && !tx}>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.category_name} · {h.name}
                {h.symbol ? ` (${h.symbol})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>{t('common.type')}</label>
          <Segmented value={effectiveType} onChange={setType} options={types.map((x) => ({ value: x, label: txLabel(x) }))} />
        </div>
        <div className="field">
          <label>{t('common.date')}</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {needsQty && (
          <div className="field">
            <label>
              {t('holdings.quantity')}
              {effectiveType === 'sell' && asset ? <span className="muted">{t('forms.currentlyHeld', { qty: asset.quantity })}</span> : null}
            </label>
            <input className="input" type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
        )}
        {needsPrice && (
          <div className="field">
            <label>{effectiveType === 'valuation' ? t('forms.latestPrice', { currency: cur }) : t('forms.tradePrice', { currency: cur })}</label>
            <input className="input" type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
        )}
        {needsQty && (
          <div className="field">
            <label>{t('forms.fee', { currency: cur })}</label>
            <input className="input" type="number" step="any" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
          </div>
        )}
        {needsAmount && (
          <div className="field">
            <label>{effectiveType === 'valuation' ? t('forms.currentValue', { currency: cur }) : t('forms.amount', { currency: cur })}</label>
            <input className="input" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        )}
        {needsFx && (
          <div className="field">
            <label>{t('forms.fxRate', { currency: cur, base })}</label>
            <input className="input" type="number" step="any" min="0" value={fxValue} onChange={(e) => setFx(e.target.value)} required />
            <span className="help">{t('forms.fxRateHelp')}</span>
          </div>
        )}
        {needsQty && quantity && price && (
          <div className="field full help">{t('forms.tradeAmount', { amount: num(Number(quantity) * Number(price), 2), currency: cur })}</div>
        )}
        <div className="field full">
          <label>{t('common.notes')}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div className="form-error full">{error}</div>}
      </form>
    </Modal>
  );
}
