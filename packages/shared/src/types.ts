import type { DEFAULT_PREFS } from './schemas';

export type ValuationMode = 'market' | 'manual';
export type TxType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'income' | 'valuation';

export interface Category {
  id: number;
  name: string;
  color: string;
  target_percent: number;
  sort_order: number;
}

export interface CategorySummary extends Category {
  value: number;
  cost: number;
  total_return: number;
  current_percent: number;
  drift_percent: number;
  asset_count: number;
}

export interface Holding {
  id: number;
  name: string;
  symbol: string | null;
  category_id: number;
  currency: string;
  valuation_mode: ValuationMode;
  notes: string | null;
  sector: string | null;
  components_as_of: string | null;
  account_id: number | null;
  account_name: string | null;
  archived: number;
  created_at: string;
  category_name: string;
  category_color: string;
  fx_rate: number;
  quantity: number;
  price: number;
  value: number;
  cost: number;
  value_base: number;
  cost_base: number;
  invested_base: number;
  unrealized_base: number;
  realized_base: number;
  income_base: number;
  total_return_base: number;
  return_percent: number | null;
  weight_percent: number;
  last_price_date: string | null;
  tx_count: number;
}

export interface Summary {
  base_currency: string;
  total_value: number;
  total_cost: number;
  total_invested: number;
  unrealized: number;
  realized: number;
  income: number;
  total_return: number;
  return_percent: number | null;
  target_sum: number;
  max_drift: number;
  categories: CategorySummary[];
  holdings: Holding[];
}

export interface HistoryPoint {
  date: string;
  total: number;
  cost: number;
  by_category: Record<string, number>;
}

export interface History {
  base_currency: string;
  interval: 'week' | 'month';
  points: HistoryPoint[];
  categories: Category[];
}

export interface Transaction {
  id: number;
  asset_id: number;
  type: TxType;
  date: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fee: number;
  note: string | null;
  asset_name?: string;
  asset_symbol?: string | null;
  currency?: string;
  valuation_mode?: ValuationMode;
  category_name?: string;
  category_color?: string;
}

export interface RebalanceRow {
  category_id: number;
  name: string;
  color: string;
  current_value: number;
  current_percent: number;
  target_percent: number;
  target_value: number;
  delta: number;
  after_value: number;
  after_percent: number;
}

export interface Rebalance {
  base_currency: string;
  total_value: number;
  new_money: number;
  final_total: number;
  target_sum: number;
  mode: 'full' | 'buy_only';
  rows: RebalanceRow[];
  holdings: { id: number; name: string; category_id: number; value_base: number }[];
}

export interface Settings {
  base_currency: string;
  fx_rates: Record<string, number>;
  data_dir: string;
  db_path: string;
}

export interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
  kind: 'auto' | 'manual' | 'pre-migration' | 'pre-restore' | 'legacy' | 'other';
}

export interface Meta {
  version: string;
  node: string;
  schema_version: number;
  backup_cron: string | null;
  backup_keep: number;
}

export interface User {
  id: number;
  username: string;
}

export interface Component {
  symbol: string | null;
  name: string;
  weight: number;
  sector: string | null;
}

export interface SecurityExposure {
  key: string;
  symbol: string | null;
  name: string;
  sector: string | null;
  direct: number;
  indirect: number;
  total: number;
  percent: number;
  direct_percent: number;
  indirect_percent: number;
  overlap: boolean;
  amplification: number | null;
  direct_assets: { asset_id: number; asset_name: string; value: number }[];
  via: { asset_id: number; asset_name: string; weight: number; value: number }[];
}

export interface Exposure {
  base_currency: string;
  total_value: number;
  fund_value: number;
  disclosed_value: number;
  overlap_count: number;
  securities: SecurityExposure[];
  sectors: { name: string; direct: number; indirect: number; total: number; percent: number }[];
  funds: { asset_id: number; name: string; symbol: string | null; value: number; component_count: number; disclosed_weight: number; as_of: string | null }[];
  fund_overlaps: { a: string; b: string; overlap: number; common: { name: string; a: number; b: number }[] }[];
  missing_funds: { asset_id: number; name: string; symbol: string | null; value: number }[];
}

export type AccountType = 'broker' | 'bank' | 'insurance' | 'exchange' | 'fund' | 'other';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  notes: string | null;
  asset_count: number;
  value: number;
  cost: number;
  total_return: number;
  invested: number;
  percent: number;
}

export type PeriodKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | 'ALL';

export interface PeriodMetrics {
  key: PeriodKey;
  start: string;
  end: string;
  days: number;
  start_value: number;
  end_value: number;
  net_inflow: number;
  gain: number;
  twr: number;
  twr_annualized: number | null;
  mwr: number | null;
  mwr_annualized: number | null;
  max_drawdown: number;
  drawdown_peak: string | null;
  drawdown_trough: string | null;
}

export interface Performance {
  base_currency: string;
  period: PeriodKey;
  metrics: PeriodMetrics | null;
  periods: PeriodMetrics[];
  series: { date: string; value: number; cost: number; net_invested: number; twr: number }[];
}

export interface Income {
  base_currency: string;
  total: number;
  last12: number;
  monthly_avg: number;
  months: { month: string; amount: number }[];
  years: { year: string; amount: number }[];
  assets: { asset_id: number; name: string; category_name: string; category_color: string; total: number; last12: number; count: number }[];
}

export type RuleStatus = 'pass' | 'warn' | 'fail' | 'info';
export interface HealthRule {
  id: string;
  group: string;
  title: string;
  status: RuleStatus;
  message: string;
  details?: string[];
  link?: string;
}

export type Prefs = typeof DEFAULT_PREFS;

export interface Health {
  base_currency: string;
  prefs: Prefs;
  results: HealthRule[];
  score: { passed: number; total: number } | null;
}

export type GoalStatus = 'achieved' | 'on_track' | 'at_risk' | 'off_track';
export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string;
  monthly_contribution: number;
  expected_return: number;
  scope_type: 'portfolio' | 'category' | 'account';
  scope_id: number | null;
  notes: string | null;
  scope_name: string;
  current: number;
  progress: number;
  months_left: number;
  projected: number;
  status: GoalStatus;
  required_monthly: number | null;
  trajectory: { date: string; pessimistic: number; nominal: number; optimistic: number }[];
}

export interface Planning {
  base_currency: string;
  total_value: number;
  goals: Goal[];
  fire: {
    monthly_expense: number;
    swr: number;
    expected_return: number;
    monthly_saving: number;
    sustainable_annual: number;
    fire_number: number | null;
    progress: number | null;
    months_to_fire: number | null;
    fire_date: string | null;
  };
}
