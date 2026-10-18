import { z } from 'zod';

/**
 * 前后端共用的请求校验规则。自定义规则的 message 为文案键（见服务端 i18n 的 validation.*）。服务端用它校验请求体，前端可直接复用做表单校验，
 * 推导出的类型也由两端共享，避免两份定义悄悄不一致。
 */

export const TX_TYPES = ['buy', 'sell', 'deposit', 'withdraw', 'income', 'valuation'] as const;
export const VALUATION_MODES = ['market', 'manual'] as const;
export const ACCOUNT_TYPES = ['broker', 'bank', 'insurance', 'exchange', 'fund', 'other'] as const;
export const GOAL_SCOPES = ['portfolio', 'category', 'account'] as const;
export const PERIOD_KEYS = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'ALL'] as const;

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');
export const currencyCode = z.string().trim().toUpperCase().min(2).max(10);

/** 金额 / 数量：接受数字或数字字符串，服务端统一存为十进制字符串，避免浮点误差 */
export const decimalInput = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'invalid_number'),
]);

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  target_percent: z.number().min(0).max(100).default(0),
});

export const targetsInput = z.array(z.object({ id: z.number().int(), target_percent: z.number().min(0).max(100) }));

export const accountInput = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(ACCOUNT_TYPES),
  notes: z.string().max(500).nullish(),
});

export const assetInput = z.object({
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().max(30).nullish(),
  category_id: z.number().int(),
  account_id: z.number().int().nullish(),
  currency: currencyCode,
  valuation_mode: z.enum(VALUATION_MODES),
  notes: z.string().max(1000).nullish(),
  sector: z.string().trim().max(40).nullish(),
  archived: z.boolean().optional(),
});

export const assetCreateInput = assetInput.extend({
  initial: z
    .object({
      date: dateStr,
      quantity: decimalInput.optional(),
      price: decimalInput.optional(),
      amount: decimalInput.optional(),
      fee: decimalInput.default(0),
      fx_rate: decimalInput.optional(),
    })
    .optional(),
});

export const txInput = z
  .object({
    asset_id: z.number().int(),
    type: z.enum(TX_TYPES),
    date: dateStr,
    quantity: decimalInput.nullish(),
    price: decimalInput.nullish(),
    amount: decimalInput.nullish(),
    fee: decimalInput.default(0),
    /** 成交汇率：1 单位资产币种 = ? 基准币种；外币交易省略时按当前汇率记录 */
    fx_rate: decimalInput.nullish(),
    note: z.string().max(500).nullish(),
  })
  .superRefine((t, ctx) => {
    const need = (field: 'quantity' | 'price' | 'amount') => {
      if (t[field] === null || t[field] === undefined) ctx.addIssue({ code: 'custom', path: [field], message: 'required' });
    };
    if (t.type === 'buy' || t.type === 'sell') {
      need('quantity');
      need('price');
    } else if (t.type === 'valuation') {
      if (t.price == null && t.amount == null) ctx.addIssue({ code: 'custom', path: ['price'], message: 'price_or_value' });
    } else {
      need('amount');
    }
  });

export const componentInput = z.object({
  symbol: z.string().trim().max(30).nullish(),
  name: z.string().trim().min(1).max(80),
  weight: z.number().min(0).max(100),
  sector: z.string().trim().max(40).nullish(),
});

export const componentsInput = z.object({ as_of: dateStr.nullish(), items: z.array(componentInput).max(5000) });

export const goalInput = z.object({
  name: z.string().trim().min(1).max(60),
  target_amount: z.number().positive(),
  target_date: dateStr,
  monthly_contribution: z.number().min(0).default(0),
  expected_return: z.number().min(-20).max(50).default(5),
  scope_type: z.enum(GOAL_SCOPES).default('portfolio'),
  scope_id: z.number().int().nullish(),
  notes: z.string().max(500).nullish(),
});

export const settingsInput = z.object({
  base_currency: currencyCode,
  fx_rates: z.record(currencyCode, z.number().positive()),
});

export const loginInput = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

/** 可调整的偏好与阈值 */
export const DEFAULT_PREFS = {
  rebalance_band: 5,
  max_single_asset: 20,
  max_single_stock: 10,
  max_sector: 30,
  max_account: 70,
  max_foreign_currency: 60,
  stale_market_days: 30,
  stale_manual_days: 400,
  max_fee_ratio: 1,
  monthly_expense: 0,
  emergency_months: 6,
  emergency_category_ids: [] as number[],
  fire_swr: 4,
  fire_return: 5,
  fire_monthly_saving: 0,
};

const prefNumber = z.number().min(0).max(1e9);
export const prefsInput = z
  .object({
    rebalance_band: prefNumber,
    max_single_asset: prefNumber,
    max_single_stock: prefNumber,
    max_sector: prefNumber,
    max_account: prefNumber,
    max_foreign_currency: prefNumber,
    stale_market_days: prefNumber,
    stale_manual_days: prefNumber,
    max_fee_ratio: prefNumber,
    monthly_expense: prefNumber,
    emergency_months: prefNumber,
    emergency_category_ids: z.array(z.number().int()),
    fire_swr: prefNumber,
    fire_return: prefNumber,
    fire_monthly_saving: prefNumber,
  })
  .partial()
  .strict();

export type CategoryInput = z.infer<typeof categoryInput>;
export type AccountInput = z.infer<typeof accountInput>;
export type AssetInput = z.infer<typeof assetInput>;
export type AssetCreateInput = z.infer<typeof assetCreateInput>;
export type TxInput = z.infer<typeof txInput>;
export type ComponentInput = z.infer<typeof componentInput>;
export type GoalInput = z.infer<typeof goalInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type PrefsInput = z.infer<typeof prefsInput>;

export const csvImportInput = z.object({
  csv: z.string().min(1).max(10_000_000),
  /** 找不到的资产 / 账户是否自动创建 */
  create_missing: z.boolean().default(true),
  /** 新建资产的默认类别（CSV 未提供或无法匹配时） */
  default_category_id: z.number().int().nullish(),
  /** 新建资产的默认账户（CSV 未提供时） */
  default_account_id: z.number().int().nullish(),
});
export type CsvImportInput = z.infer<typeof csvImportInput>;
