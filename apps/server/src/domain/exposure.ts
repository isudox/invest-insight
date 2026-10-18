import { asc } from 'drizzle-orm';
import type { Exposure, Holding } from '@invest-insight/shared';
import { getDb } from '../db/index.js';
import { assetComponents } from '../db/schema.js';
import { computeHoldings } from './portfolio.js';
import { getBaseCurrency } from './prefs.js';

/**
 * 穿透分析：把基金 / ETF 按成分权重拆到底层个股和行业，
 * 与直接持有的个股合并，得到每只个股、每个行业的真实敞口。
 */

type ComponentRow = { asset_id: number; symbol: string | null; name: string; weight: number; sector: string | null };

/** 特殊行业键，由前端按界面语言显示为「未披露成分」「未设置行业」 */
export const UNDISCLOSED = '__undisclosed__';
export const UNSET_SECTOR = '__unset__';

/**
 * 统一证券代码，便于把基金成分与直接持仓对上：
 * 600519.SH / SH600519 → 600519；0700.HK / HK00700 → 00700；aapl → AAPL
 */
export function normalizeSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/\.(SH|SS|SZ|BJ|HK|US|O|N|OQ)$/, '');
  s = s.replace(/^(SH|SZ|BJ|HK|US)(?=\d)/, '');
  if (/^\d{1,4}$/.test(s)) s = s.padStart(5, '0'); // 港股代码补足 5 位
  return s;
}

function securityKey(symbol: string | null, name: string): string {
  return normalizeSymbol(symbol) ?? `name:${name.trim()}`;
}

const FUND_HINT = /ETF|LOF|FOF|QDII|基金|指数|联接/i;

export function computeExposure(): Exposure {
  const holdings = computeHoldings(false);
  const total = holdings.reduce((s, h) => s + h.value_base, 0);
  const comps: ComponentRow[] = getDb()
    .select({
      asset_id: assetComponents.asset_id,
      symbol: assetComponents.symbol,
      name: assetComponents.name,
      weight: assetComponents.weight,
      sector: assetComponents.sector,
    })
    .from(assetComponents)
    .orderBy(asc(assetComponents.sort_order), asc(assetComponents.id))
    .all();
  const compsByAsset = new Map<number, ComponentRow[]>();
  for (const c of comps) {
    if (!compsByAsset.has(c.asset_id)) compsByAsset.set(c.asset_id, []);
    compsByAsset.get(c.asset_id)!.push(c);
  }

  type Via = { asset_id: number; asset_name: string; weight: number; value: number };
  type Security = {
    key: string;
    symbol: string | null;
    name: string;
    sector: string | null;
    direct: number;
    direct_assets: { asset_id: number; asset_name: string; value: number }[];
    indirect: number;
    via: Via[];
  };
  const securities = new Map<string, Security>();
  const getSec = (key: string, symbol: string | null, name: string): Security => {
    let s = securities.get(key);
    if (!s) {
      s = { key, symbol, name, sector: null, direct: 0, direct_assets: [], indirect: 0, via: [] };
      securities.set(key, s);
    }
    return s;
  };

  const funds: Holding[] = [];
  // 1) 直接持有的个股（按数量 × 价格估值、且未录入成分的资产）
  for (const h of holdings) {
    if (compsByAsset.has(h.id)) {
      funds.push(h);
      continue;
    }
    if (h.valuation_mode !== 'market' || h.value_base <= 0) continue;
    const sec = getSec(securityKey(h.symbol, h.name), h.symbol, h.name);
    sec.name = h.name; // 以直接持仓的名称为准
    sec.direct += h.value_base;
    sec.direct_assets.push({ asset_id: h.id, asset_name: h.name, value: h.value_base });
    if (h.sector) sec.sector = h.sector;
  }

  // 2) 基金按成分拆分
  const sectorMap = new Map<string, { direct: number; indirect: number }>();
  const addSector = (name: string, kind: 'direct' | 'indirect', v: number) => {
    const row = sectorMap.get(name) ?? { direct: 0, indirect: 0 };
    row[kind] += v;
    sectorMap.set(name, row);
  };

  const fundSummaries = funds.map((f) => {
    const list = compsByAsset.get(f.id)!;
    const disclosed = Math.min(
      100,
      list.reduce((s, c) => s + c.weight, 0),
    );
    for (const c of list) {
      const value = (f.value_base * c.weight) / 100;
      const sec = getSec(securityKey(c.symbol, c.name), c.symbol, c.name);
      if (!sec.symbol && c.symbol) sec.symbol = c.symbol;
      if (!sec.sector && c.sector) sec.sector = c.sector;
      sec.indirect += value;
      sec.via.push({ asset_id: f.id, asset_name: f.name, weight: c.weight, value });
    }
    const remainder = (f.value_base * (100 - disclosed)) / 100;
    if (remainder > 0.005) addSector(UNDISCLOSED, 'indirect', remainder);
    return {
      asset_id: f.id,
      name: f.name,
      symbol: f.symbol,
      value: f.value_base,
      component_count: list.length,
      disclosed_weight: disclosed,
      as_of: f.components_as_of,
    };
  });

  // 3) 行业汇总（直接持仓的行业优先于基金成分里填写的行业）
  for (const sec of securities.values()) {
    const sector = sec.sector || UNSET_SECTOR;
    if (sec.direct) addSector(sector, 'direct', sec.direct);
    if (sec.indirect) addSector(sector, 'indirect', sec.indirect);
  }

  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const securityRows = [...securities.values()]
    .map((s) => {
      const t = s.direct + s.indirect;
      return {
        ...s,
        total: t,
        percent: pct(t),
        direct_percent: pct(s.direct),
        indirect_percent: pct(s.indirect),
        overlap: s.direct > 0 && s.indirect > 0,
        // 穿透后敞口是直接持仓的多少倍
        amplification: s.direct > 0 ? t / s.direct : null,
        via: s.via.sort((a, b) => b.value - a.value),
      };
    })
    .sort((a, b) => b.total - a.total);

  const sectorRows = [...sectorMap.entries()]
    .map(([name, v]) => ({ name, direct: v.direct, indirect: v.indirect, total: v.direct + v.indirect, percent: pct(v.direct + v.indirect) }))
    .sort((a, b) => {
      // 「未披露」「未设置」排在最后
      const rank = (n: string) => (n === UNDISCLOSED ? 2 : n === UNSET_SECTOR ? 1 : 0);
      return rank(a.name) - rank(b.name) || b.total - a.total;
    });

  // 4) 基金之间的成分重合度：Σ min(权重A, 权重B)
  const fundWeights = funds.map((f) => {
    const m = new Map<string, { name: string; weight: number }>();
    for (const c of compsByAsset.get(f.id)!) {
      const k = securityKey(c.symbol, c.name);
      const prev = m.get(k);
      m.set(k, { name: c.name, weight: (prev?.weight ?? 0) + c.weight });
    }
    return { fund: f, weights: m };
  });
  const fundOverlaps: { a: string; b: string; overlap: number; common: { name: string; a: number; b: number }[] }[] = [];
  for (let i = 0; i < fundWeights.length; i++) {
    for (let j = i + 1; j < fundWeights.length; j++) {
      const A = fundWeights[i];
      const B = fundWeights[j];
      let overlap = 0;
      const common: { name: string; a: number; b: number }[] = [];
      for (const [k, wa] of A.weights) {
        const wb = B.weights.get(k);
        if (!wb) continue;
        overlap += Math.min(wa.weight, wb.weight);
        common.push({ name: wa.name, a: wa.weight, b: wb.weight });
      }
      if (overlap > 0) {
        fundOverlaps.push({ a: A.fund.name, b: B.fund.name, overlap, common: common.sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)) });
      }
    }
  }
  fundOverlaps.sort((x, y) => y.overlap - x.overlap);

  // 疑似基金但还没录入成分的资产，提示用户补充
  const missingFunds = holdings
    .filter((h) => !compsByAsset.has(h.id) && h.valuation_mode === 'market' && h.value_base > 0 && (FUND_HINT.test(h.name) || FUND_HINT.test(h.category_name)))
    .map((h) => ({ asset_id: h.id, name: h.name, symbol: h.symbol, value: h.value_base }));

  const fundValue = fundSummaries.reduce((s, f) => s + f.value, 0);
  const disclosedValue = fundSummaries.reduce((s, f) => s + (f.value * f.disclosed_weight) / 100, 0);

  return {
    base_currency: getBaseCurrency(),
    total_value: total,
    fund_value: fundValue,
    disclosed_value: disclosedValue,
    overlap_count: securityRows.filter((s) => s.overlap).length,
    securities: securityRows,
    sectors: sectorRows,
    funds: fundSummaries,
    fund_overlaps: fundOverlaps,
    missing_funds: missingFunds,
  };
}
