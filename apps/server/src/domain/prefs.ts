import { eq } from 'drizzle-orm';
import { DEFAULT_PREFS, type Prefs, type PrefsInput } from '@invest-insight/shared';
import { getDb } from '../db/index.js';
import { fxRates, settings } from '../db/schema.js';

export function getSetting(key: string): string | null {
  return getDb().select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function putSetting(key: string, value: string) {
  getDb().insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export function getBaseCurrency(): string {
  return getSetting('base_currency') ?? 'CNY';
}

export function getFxRates(): Record<string, number> {
  return Object.fromEntries(
    getDb()
      .select()
      .from(fxRates)
      .all()
      .map((r) => [r.currency, r.rate]),
  );
}

export function fxToBase(currency: string, rates: Record<string, number>): number {
  return rates[currency] ?? 1;
}

export function getPrefs(): Prefs {
  let stored: Partial<Prefs> = {};
  try {
    stored = JSON.parse(getSetting('prefs') ?? '{}');
  } catch {
    stored = {};
  }
  return { ...DEFAULT_PREFS, ...stored };
}

export function setPrefs(patch: PrefsInput): Prefs {
  const next = { ...getPrefs(), ...patch };
  putSetting('prefs', JSON.stringify(next));
  return next;
}
