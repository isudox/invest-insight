import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * 数据库结构。修改后运行 `pnpm db:generate` 生成新的迁移文件并一并提交；
 * 服务启动时会自动执行未应用的迁移（执行前自动备份）。
 *
 * 交易流水中的数量、价格、金额、费用以十进制字符串保存，由 decimal.js 计算，避免浮点误差。
 */

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const fxRates = sqliteTable('fx_rates', {
  currency: text('currency').primaryKey(),
  /** 1 单位该币种 = rate 单位基准币种 */
  rate: real('rate').notNull(),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  target_percent: real('target_percent').notNull().default(0),
  sort_order: integer('sort_order').notNull().default(0),
});

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  type: text('type', { enum: ['broker', 'bank', 'insurance', 'exchange', 'fund', 'other'] })
    .notNull()
    .default('other'),
  notes: text('notes'),
  sort_order: integer('sort_order').notNull().default(0),
});

export const assets = sqliteTable(
  'assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    symbol: text('symbol'),
    category_id: integer('category_id')
      .notNull()
      .references(() => categories.id),
    account_id: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    currency: text('currency').notNull().default('CNY'),
    valuation_mode: text('valuation_mode', { enum: ['market', 'manual'] }).notNull(),
    notes: text('notes'),
    sector: text('sector'),
    components_as_of: text('components_as_of'),
    archived: integer('archived').notNull().default(0),
    created_at: createdAt(),
  },
  (t) => [index('idx_assets_category').on(t.category_id), index('idx_assets_account').on(t.account_id)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    asset_id: integer('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['buy', 'sell', 'deposit', 'withdraw', 'income', 'valuation'] }).notNull(),
    date: text('date').notNull(),
    quantity: text('quantity'),
    price: text('price'),
    amount: text('amount'),
    fee: text('fee').notNull().default('0'),
    /** 成交时的汇率：1 单位资产币种 = fx_rate 单位 fx_base（记录时的基准币种）；为空表示未知，按当前汇率估算 */
    fx_rate: text('fx_rate'),
    fx_base: text('fx_base'),
    note: text('note'),
    created_at: createdAt(),
  },
  (t) => [index('idx_tx_asset_date').on(t.asset_id, t.date), index('idx_tx_date').on(t.date)],
);

export const assetComponents = sqliteTable(
  'asset_components',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    asset_id: integer('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    symbol: text('symbol'),
    name: text('name').notNull(),
    weight: real('weight').notNull(),
    sector: text('sector'),
    sort_order: integer('sort_order').notNull().default(0),
  },
  (t) => [index('idx_components_asset').on(t.asset_id)],
);

export const goals = sqliteTable('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  target_amount: real('target_amount').notNull(),
  target_date: text('target_date').notNull(),
  monthly_contribution: real('monthly_contribution').notNull().default(0),
  expected_return: real('expected_return').notNull().default(5),
  scope_type: text('scope_type', { enum: ['portfolio', 'category', 'account'] })
    .notNull()
    .default('portfolio'),
  scope_id: integer('scope_id'),
  notes: text('notes'),
  created_at: createdAt(),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: createdAt(),
  last_login_at: text('last_login_at'),
});

export const sessions = sqliteTable(
  'sessions',
  {
    token_hash: text('token_hash').primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires_at: integer('expires_at').notNull(),
    created_at: createdAt(),
  },
  (t) => [index('idx_sessions_user').on(t.user_id)],
);

/** 登录失败计数（持久化，重启后仍然有效） */
export const loginAttempts = sqliteTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  first_at: integer('first_at').notNull(),
  locked_until: integer('locked_until').notNull().default(0),
});

export type TxRow = typeof transactions.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type ComponentRow = typeof assetComponents.$inferSelect;
