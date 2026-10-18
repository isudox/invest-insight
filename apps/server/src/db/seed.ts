import { sql } from 'drizzle-orm';
import type { Locale } from '../i18n.js';
import type { DB } from './index.js';
import { categories, fxRates, settings } from './schema.js';

export const DEFAULT_CATEGORIES: { name: Record<Locale, string>; color: string; target: number }[] = [
  { name: { 'zh-CN': '股票', en: 'Stocks' }, color: '#2a78d6', target: 40 },
  { name: { 'zh-CN': '基金', en: 'Funds' }, color: '#eb6834', target: 15 },
  { name: { 'zh-CN': '债券', en: 'Bonds' }, color: '#1baf7a', target: 15 },
  { name: { 'zh-CN': '保险', en: 'Insurance' }, color: '#eda100', target: 10 },
  { name: { 'zh-CN': '加密货币', en: 'Crypto' }, color: '#e87ba4', target: 5 },
  { name: { 'zh-CN': '现金', en: 'Cash' }, color: '#008300', target: 15 },
];

export const DEFAULT_FX: Record<string, number> = {
  CNY: 1,
  USD: 7.12,
  HKD: 0.915,
  EUR: 7.75,
  JPY: 0.048,
};

const count = (db: DB, table: typeof settings | typeof fxRates | typeof categories) =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get()!.n;

/** 空库时写入默认基准币种、汇率与资产类别（类别名称按 locale） */
export function seedDefaults(db: DB, locale: Locale = 'zh-CN') {
  if (
    !db
      .select()
      .from(settings)
      .where(sql`key = 'base_currency'`)
      .get()
  ) {
    db.insert(settings).values({ key: 'base_currency', value: 'CNY' }).run();
  }
  if (count(db, fxRates) === 0) {
    db.insert(fxRates)
      .values(Object.entries(DEFAULT_FX).map(([currency, rate]) => ({ currency, rate })))
      .run();
  }
  if (count(db, categories) === 0) {
    db.insert(categories)
      .values(DEFAULT_CATEGORIES.map((c, i) => ({ name: c.name[locale], color: c.color, target_percent: c.target, sort_order: i })))
      .run();
  }
}
