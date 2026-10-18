import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  accountInput,
  assetCreateInput,
  assetInput,
  categoryInput,
  componentsInput,
  goalInput,
  targetsInput,
  TX_TYPES,
  txInput,
  type TxInput,
} from '@invest-insight/shared';
import { getDb, tx } from '../../db/index.js';
import { accounts, assetComponents, assets, categories, goals, transactions, type TxRow } from '../../db/schema.js';
import { toDecimalString } from '../../domain/ledger.js';
import { computeHoldings, listCategories } from '../../domain/portfolio.js';
import { body, HttpError, idParam, type AppEnv } from '../context.js';

const num = (v: string | null) => (v === null ? null : Number(v));
/** 对外输出时金额转为 number；内部存储与计算仍为十进制字符串 */
const txOut = (t: TxRow) => ({ ...t, quantity: num(t.quantity), price: num(t.price), amount: num(t.amount), fee: Number(t.fee) });

const nextSort = (table: typeof categories | typeof accounts) =>
  (getDb()
    .select({ m: sql<number>`coalesce(max(${table.sort_order}), -1)` })
    .from(table)
    .get()?.m ?? -1) + 1;

// ---------- 类别 ----------

export const categoryRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json(listCategories()))
  .post('/', async (c) => {
    const b = await body(c, categoryInput);
    const r = getDb()
      .insert(categories)
      .values({ ...b, sort_order: nextSort(categories) })
      .returning({ id: categories.id })
      .get();
    return c.json(r, 201);
  })
  .put('/targets', async (c) => {
    const b = await body(c, targetsInput);
    tx(() => b.forEach((t) => getDb().update(categories).set({ target_percent: t.target_percent }).where(eq(categories.id, t.id)).run()));
    return c.json(listCategories());
  })
  .put('/:id', async (c) => {
    const b = await body(c, categoryInput);
    getDb()
      .update(categories)
      .set(b)
      .where(eq(categories.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  })
  .delete('/:id', (c) => {
    const id = idParam(c);
    const n = getDb()
      .select({ n: sql<number>`count(*)` })
      .from(assets)
      .where(eq(assets.category_id, id))
      .get()!.n;
    if (n > 0) throw new HttpError(409, 'error.category_in_use');
    getDb().delete(categories).where(eq(categories.id, id)).run();
    return c.json({ ok: true });
  });

// ---------- 账户 ----------

export const accountRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    const rows = getDb().select().from(accounts).orderBy(asc(accounts.sort_order), asc(accounts.id)).all();
    const holdings = computeHoldings(false);
    const total = holdings.reduce((s, h) => s + h.value_base, 0);
    return c.json(
      rows.map((a) => {
        const hs = holdings.filter((h) => h.account_id === a.id);
        const value = hs.reduce((s, h) => s + h.value_base, 0);
        return {
          ...a,
          asset_count: hs.length,
          value,
          cost: hs.reduce((s, h) => s + h.cost_base, 0),
          total_return: hs.reduce((s, h) => s + h.total_return_base, 0),
          invested: hs.reduce((s, h) => s + h.invested_base, 0),
          percent: total > 0 ? (value / total) * 100 : 0,
        };
      }),
    );
  })
  .post('/', async (c) => {
    const b = await body(c, accountInput);
    const r = getDb()
      .insert(accounts)
      .values({ name: b.name, type: b.type, notes: b.notes ?? null, sort_order: nextSort(accounts) })
      .returning({ id: accounts.id })
      .get();
    return c.json(r, 201);
  })
  .put('/:id', async (c) => {
    const b = await body(c, accountInput);
    getDb()
      .update(accounts)
      .set({ name: b.name, type: b.type, notes: b.notes ?? null })
      .where(eq(accounts.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  })
  .delete('/:id', (c) => {
    // 资产保留，仅解除与账户的关联（外键 ON DELETE SET NULL）
    getDb()
      .delete(accounts)
      .where(eq(accounts.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  });

// ---------- 资产与基金成分 ----------

export const assetRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json(computeHoldings(c.req.query('archived') === '1')))
  .get('/:id', (c) => {
    const id = idParam(c);
    const h = computeHoldings(true).find((x) => x.id === id);
    if (!h) throw new HttpError(404, 'error.asset_not_found');
    const txs = getDb().select().from(transactions).where(eq(transactions.asset_id, id)).orderBy(desc(transactions.date), desc(transactions.id)).all();
    return c.json({ ...h, transactions: txs.map(txOut) });
  })
  .post('/', async (c) => {
    const b = await body(c, assetCreateInput);
    const id = tx(() => {
      const { id: assetId } = getDb()
        .insert(assets)
        .values({
          name: b.name,
          symbol: b.symbol || null,
          category_id: b.category_id,
          account_id: b.account_id ?? null,
          currency: b.currency,
          valuation_mode: b.valuation_mode,
          notes: b.notes ?? null,
          sector: b.sector || null,
        })
        .returning({ id: assets.id })
        .get();
      const init = b.initial;
      if (init && b.valuation_mode === 'market' && init.quantity != null && init.price != null && Number(init.quantity) > 0) {
        getDb()
          .insert(transactions)
          .values({
            asset_id: assetId,
            type: 'buy',
            date: init.date,
            quantity: toDecimalString(init.quantity),
            price: toDecimalString(init.price),
            fee: toDecimalString(init.fee) ?? '0',
            note: '初始持仓',
          })
          .run();
      } else if (init && b.valuation_mode === 'manual' && init.amount != null && Number(init.amount) > 0) {
        getDb()
          .insert(transactions)
          .values({ asset_id: assetId, type: 'deposit', date: init.date, amount: toDecimalString(init.amount), note: '初始投入' })
          .run();
      }
      return assetId;
    });
    return c.json({ id }, 201);
  })
  .put('/:id', async (c) => {
    const b = await body(c, assetInput);
    getDb()
      .update(assets)
      .set({
        name: b.name,
        symbol: b.symbol || null,
        category_id: b.category_id,
        account_id: b.account_id ?? null,
        currency: b.currency,
        valuation_mode: b.valuation_mode,
        notes: b.notes ?? null,
        sector: b.sector || null,
        archived: b.archived ? 1 : 0,
      })
      .where(eq(assets.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  })
  .delete('/:id', (c) => {
    getDb()
      .delete(assets)
      .where(eq(assets.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  })
  .get('/:id/components', (c) => {
    const id = idParam(c);
    const asset = getDb().select({ id: assets.id, as_of: assets.components_as_of }).from(assets).where(eq(assets.id, id)).get();
    if (!asset) throw new HttpError(404, 'error.asset_not_found');
    const items = getDb()
      .select({ symbol: assetComponents.symbol, name: assetComponents.name, weight: assetComponents.weight, sector: assetComponents.sector })
      .from(assetComponents)
      .where(eq(assetComponents.asset_id, id))
      .orderBy(asc(assetComponents.sort_order), asc(assetComponents.id))
      .all();
    return c.json({ asset_id: id, as_of: asset.as_of, items });
  })
  .put('/:id/components', async (c) => {
    const id = idParam(c);
    const b = await body(c, componentsInput);
    const sum = b.items.reduce((s, i) => s + i.weight, 0);
    if (sum > 100.5) throw new HttpError(400, 'error.weights_over_100', { sum: sum.toFixed(2) });
    tx(() => {
      const db = getDb();
      db.delete(assetComponents).where(eq(assetComponents.asset_id, id)).run();
      if (b.items.length) {
        db.insert(assetComponents)
          .values(b.items.map((i, k) => ({ asset_id: id, symbol: i.symbol || null, name: i.name, weight: i.weight, sector: i.sector || null, sort_order: k })))
          .run();
      }
      db.update(assets)
        .set({ components_as_of: b.items.length ? (b.as_of ?? null) : null })
        .where(eq(assets.id, id))
        .run();
    });
    return c.json({ ok: true });
  });

// ---------- 交易流水 ----------

function txValues(t: TxInput) {
  return {
    asset_id: t.asset_id,
    type: t.type,
    date: t.date,
    quantity: toDecimalString(t.quantity),
    price: toDecimalString(t.price),
    amount: toDecimalString(t.amount),
    fee: toDecimalString(t.fee) ?? '0',
    note: t.note ?? null,
  };
}

function checkSell(t: TxInput, excludeTxId?: number) {
  if (t.type !== 'sell') return;
  const h = computeHoldings(true).find((x) => x.id === t.asset_id);
  if (!h) throw new HttpError(404, 'error.asset_not_found');
  // 编辑卖出记录时，当前持仓已扣除该笔，需加回
  const prev = excludeTxId ? getDb().select().from(transactions).where(eq(transactions.id, excludeTxId)).get() : undefined;
  const available = h.quantity + (prev?.type === 'sell' && prev.asset_id === t.asset_id ? Number(prev.quantity ?? 0) : 0);
  if (Number(t.quantity ?? 0) > available + 1e-9) throw new HttpError(400, 'error.sell_exceeds', { available });
}

export const transactionRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    const where: SQL[] = [];
    const assetId = Number(c.req.query('assetId'));
    const categoryId = Number(c.req.query('categoryId'));
    const type = c.req.query('type') as (typeof TX_TYPES)[number];
    if (assetId) where.push(eq(transactions.asset_id, assetId));
    if (categoryId) where.push(eq(assets.category_id, categoryId));
    if (TX_TYPES.includes(type)) where.push(eq(transactions.type, type));
    const limit = Math.min(Number(c.req.query('limit')) || 500, 5000);
    const rows = getDb()
      .select({
        tx: transactions,
        asset_name: assets.name,
        asset_symbol: assets.symbol,
        currency: assets.currency,
        valuation_mode: assets.valuation_mode,
        category_name: categories.name,
        category_color: categories.color,
      })
      .from(transactions)
      .innerJoin(assets, eq(assets.id, transactions.asset_id))
      .innerJoin(categories, eq(categories.id, assets.category_id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .all();
    return c.json(rows.map(({ tx: t, ...rest }) => ({ ...txOut(t), ...rest })));
  })
  .post('/', async (c) => {
    const b = await body(c, txInput);
    checkSell(b);
    const r = getDb().insert(transactions).values(txValues(b)).returning({ id: transactions.id }).get();
    return c.json(r, 201);
  })
  .put('/:id', async (c) => {
    const id = idParam(c);
    const b = await body(c, txInput);
    checkSell(b, id);
    getDb().update(transactions).set(txValues(b)).where(eq(transactions.id, id)).run();
    return c.json({ ok: true });
  })
  .delete('/:id', (c) => {
    getDb()
      .delete(transactions)
      .where(eq(transactions.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  });

// ---------- 目标 ----------

const goalValues = (g: ReturnType<typeof goalInput.parse>) => ({
  name: g.name,
  target_amount: g.target_amount,
  target_date: g.target_date,
  monthly_contribution: g.monthly_contribution,
  expected_return: g.expected_return,
  scope_type: g.scope_type,
  scope_id: g.scope_type === 'portfolio' ? null : (g.scope_id ?? null),
  notes: g.notes ?? null,
});

export const goalRoutes = new Hono<AppEnv>()
  .post('/', async (c) => {
    const r = getDb()
      .insert(goals)
      .values(goalValues(await body(c, goalInput)))
      .returning({ id: goals.id })
      .get();
    return c.json(r, 201);
  })
  .put('/:id', async (c) => {
    getDb()
      .update(goals)
      .set(goalValues(await body(c, goalInput)))
      .where(eq(goals.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  })
  .delete('/:id', (c) => {
    getDb()
      .delete(goals)
      .where(eq(goals.id, idParam(c)))
      .run();
    return c.json({ ok: true });
  });
