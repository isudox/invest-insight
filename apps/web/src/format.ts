import type { AccountType, PeriodKey, TxType } from '@invest-insight/shared';
import i18n, { currentLang } from './i18n';

// 隐私模式：隐藏所有金额（参考 Ghostfolio Zen Mode / Wealthfolio 隐藏金额）
let amountsHidden = false;
export function setAmountsHidden(v: boolean) {
  amountsHidden = v;
}
export const MASK = '••••';

const SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£' };
const numberLocale = () => (currentLang() === 'en' ? 'en-US' : 'zh-CN');

export function money(n: number | null | undefined, currency = 'CNY', digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (amountsHidden) return MASK;
  const sym = SYMBOLS[currency] ?? currency + ' ';
  const sign = n < 0 ? '-' : '';
  return `${sign}${sym}${Math.abs(n).toLocaleString(numberLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** 紧凑金额：中文用 万 / 亿，英文用 K / M / B */
export function compact(n: number, currency = 'CNY'): string {
  if (amountsHidden) return MASK;
  const sym = SYMBOLS[currency] ?? '';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (currentLang() === 'en') {
    if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }
  if (abs >= 1e8) return `${sign}${sym}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}${sym}${(abs / 1e4).toFixed(abs >= 1e6 ? 0 : 1)}万`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

export function signedMoney(n: number, currency = 'CNY'): string {
  if (amountsHidden) return MASK;
  return (n > 0 ? '+' : '') + money(n, currency);
}

export function pct(n: number | null | undefined, digits = 1, signed = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function num(n: number | null | undefined, maxDigits = 4): string {
  if (n === null || n === undefined) return '—';
  if (amountsHidden) return MASK;
  return n.toLocaleString(numberLocale(), { maximumFractionDigits: maxDigits });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(numberLocale());
}

export function tone(n: number | null | undefined): string {
  if (!n) return '';
  return n > 0 ? 'up' : 'down';
}

export const txLabel = (t: TxType) => i18n.t(`tx.types.${t}`);
export const accountTypeLabel = (t: AccountType | string) => i18n.t(`accounts.types.${t as AccountType}`);
export const periodLabel = (p: PeriodKey) => i18n.t(`periods.${p}`);
export const TX_TYPE_LIST: TxType[] = ['buy', 'sell', 'deposit', 'withdraw', 'income', 'valuation'];
export const ACCOUNT_TYPE_LIST: AccountType[] = ['broker', 'bank', 'insurance', 'exchange', 'fund', 'other'];

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 分类配色：按固定顺序取用 */
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#898781'];
