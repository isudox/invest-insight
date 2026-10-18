/**
 * 服务端文案（接口错误、体检规则、目标范围名称等）。
 * 前端在每个请求的 X-Locale 头中带上当前界面语言；未带时按 Accept-Language 判断。
 */

export type Locale = 'zh-CN' | 'en';
export const LOCALES: Locale[] = ['zh-CN', 'en'];
export const DEFAULT_LOCALE: Locale = 'zh-CN';

const zh = {
  // 接口错误
  'error.invalid_json': '请求体不是合法的 JSON',
  'error.invalid_id': '无效的 ID',
  'error.body_too_large': '请求体过大',
  'error.not_found': '接口不存在',
  'error.duplicate_name': '名称已存在',
  'error.foreign_key': '关联的数据不存在',
  'error.internal': '服务器内部错误',
  'error.too_many_attempts': '登录失败次数过多，请 {minutes} 分钟后再试',
  'error.no_users': '尚未配置任何账号，请联系管理员',
  'error.bad_credentials': '用户名或密码错误',
  'error.json_required': '写请求必须使用 application/json',
  'error.origin_rejected': '请求来源不被允许。若通过反向代理访问，请设置 BASE_URL 或 TRUST_PROXY',
  'error.login_required': '请先登录',
  'error.invalid_filename': '文件名不合法',
  'error.backup_not_found': '备份不存在',
  'error.category_in_use': '该类别下还有资产，请先移走或删除这些资产',
  'error.asset_not_found': '资产不存在',
  'error.weights_over_100': '成分权重合计 {sum}% 超过 100%',
  'error.sell_exceeds': '卖出数量超过当前持仓（{available}）',
  // 参数校验
  'validation.field': '{field}：{message}',
  'validation.param': '参数',
  'validation.required': '必填',
  'validation.invalid_date': '日期格式应为 YYYY-MM-DD',
  'validation.invalid_number': '应为数字',
  'validation.price_or_value': '请填写最新价格或估值',
  'validation.invalid': '格式不正确',
  'validation.too_small': '数值或长度过小',
  'validation.too_big': '数值或长度过大',
  'validation.separator': '；',
  // 目标范围
  'scope.portfolio': '全部资产',
  'scope.category': '类别：{name}',
  'scope.account': '账户：{name}',
  'scope.deleted': '已删除',
  // 体检
  'health.group.concentration': '集中度',
  'health.group.allocation': '配置',
  'health.group.liquidity': '流动性',
  'health.group.cost': '成本',
  'health.group.data': '数据质量',
  'health.list_sep': '、',
  'health.single_asset.title': '单一资产占比',
  'health.single_asset.warn': '{count} 项资产超过 {limit}% 上限，最大为「{name}」{pct}',
  'health.single_asset.pass': '最大的「{name}」占 {pct}，未超过 {limit}%',
  'health.single_stock.title': '穿透后单一个股',
  'health.single_stock.warn': '{count} 只个股穿透后超过 {limit}%，最大为「{name}」{pct}',
  'health.single_stock.pass': '最大的「{name}」穿透后占 {pct}',
  'health.single_stock.detail_via': '（其中经由基金 {pct}）',
  'health.sector.title': '单一行业占比',
  'health.sector.warn': '{list} 超过 {limit}%',
  'health.sector.pass': '最大的「{name}」占 {pct}',
  'health.account.title': '账户（平台）分散',
  'health.account.none': '尚未给资产指定账户，无法评估平台集中风险',
  'health.account.message': '资产分布在 {count} 个账户，最大的「{name}」占 {pct}',
  'health.account.over': '，超过 {limit}%',
  'health.account.unassigned': '未指定账户',
  'health.currency.title': '外币资产占比',
  'health.currency.message': '非 {currency} 资产占 {pct}',
  'health.currency.over': '，超过 {limit}%，汇率波动影响较大',
  'health.drift.title': '目标配置偏离',
  'health.drift.none': '尚未设置目标配置',
  'health.drift.warn': '{count} 个类别偏离超过 ±{band}%：{list}',
  'health.drift.pass': '所有类别都在目标 ±{band}% 以内',
  'health.target_sum.title': '目标比例合计',
  'health.target_sum.warn': '目标比例合计 {sum}%，应为 100%',
  'health.emergency.title': '应急资金',
  'health.emergency.message': '现金类资产 {amount}，可覆盖约 {months} 个月支出（目标 {target} 个月）',
  'health.emergency.unset': '现金类资产 {amount}。设置月均支出后可评估能覆盖几个月',
  'health.fees.title': '交易费用率',
  'health.fees.message': '累计费用 {amount}，占买入金额 {ratio}%（上限 {limit}%）',
  'health.stale.title': '估值是否及时',
  'health.stale.warn': '{count} 项资产估值过期（价格类 > {market} 天，手动估值 > {manual} 天）',
  'health.stale.pass': '所有资产估值都在有效期内',
  'health.stale.detail': '{name}：最近估值 {date}',
  'health.stale.never': '从未',
  'health.fx.title': '汇率完整',
  'health.fx.fail': '缺少 {list} 的汇率，相关资产按 1:1 折算，金额会严重失真',
  'health.fx.pass': '所有币种都有汇率',
  'health.components.title': '基金成分',
  'health.components.warn': '{count} 只基金尚未录入成分，穿透分析会低估重合',
  'health.components.pass': '{count} 只基金已录入成分',
  'health.components.none': '没有需要录入成分的基金',
  'health.components_age.title': '成分数据时效',
  'health.components_age.warn': '{count} 只基金的成分数据超过 120 天，建议按最新季报更新',
  'health.components_age.pass': '成分数据都在 120 天以内',
  'health.components_age.detail': '{name}：截至 {date}',
  'health.components_age.unknown': '未知',
  'health.sector_missing.title': '个股行业',
  'health.sector_missing.warn': '{count} 项直接持有的资产未设置行业，行业敞口不完整',
  'health.sector_missing.pass': '直接持有的资产都已设置行业',
  'health.account_missing.title': '资产归属账户',
  'health.account_missing.info': '{count} 项资产未指定账户',
  'health.detail.pct': '{name}：{pct}',
};

export type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  'error.invalid_json': 'The request body is not valid JSON',
  'error.invalid_id': 'Invalid ID',
  'error.body_too_large': 'Request body is too large',
  'error.not_found': 'Endpoint not found',
  'error.duplicate_name': 'This name already exists',
  'error.foreign_key': 'Referenced data does not exist',
  'error.internal': 'Internal server error',
  'error.too_many_attempts': 'Too many failed sign-in attempts. Try again in {minutes} min',
  'error.no_users': 'No accounts have been set up yet. Please contact the administrator',
  'error.bad_credentials': 'Incorrect username or password',
  'error.json_required': 'Write requests must use application/json',
  'error.origin_rejected': 'Request origin not allowed. Behind a reverse proxy, set BASE_URL or TRUST_PROXY',
  'error.login_required': 'Please sign in',
  'error.invalid_filename': 'Invalid file name',
  'error.backup_not_found': 'Backup not found',
  'error.category_in_use': 'This category still has assets. Move or delete them first',
  'error.asset_not_found': 'Asset not found',
  'error.weights_over_100': 'Constituent weights add up to {sum}%, which exceeds 100%',
  'error.sell_exceeds': 'Sell quantity exceeds the current holding ({available})',
  'validation.field': '{field}: {message}',
  'validation.param': 'parameter',
  'validation.required': 'required',
  'validation.invalid_date': 'date must be YYYY-MM-DD',
  'validation.invalid_number': 'must be a number',
  'validation.price_or_value': 'enter the latest price or value',
  'validation.invalid': 'invalid format',
  'validation.too_small': 'value or length too small',
  'validation.too_big': 'value or length too large',
  'validation.separator': '; ',
  'scope.portfolio': 'All assets',
  'scope.category': 'Category: {name}',
  'scope.account': 'Account: {name}',
  'scope.deleted': 'deleted',
  'health.group.concentration': 'Concentration',
  'health.group.allocation': 'Allocation',
  'health.group.liquidity': 'Liquidity',
  'health.group.cost': 'Costs',
  'health.group.data': 'Data quality',
  'health.list_sep': ', ',
  'health.single_asset.title': 'Single-asset weight',
  'health.single_asset.warn': '{count} asset(s) exceed the {limit}% limit; the largest is "{name}" at {pct}',
  'health.single_asset.pass': 'The largest, "{name}", is {pct}, within {limit}%',
  'health.single_stock.title': 'Single stock (look-through)',
  'health.single_stock.warn': '{count} stock(s) exceed {limit}% after look-through; the largest is "{name}" at {pct}',
  'health.single_stock.pass': 'The largest, "{name}", is {pct} after look-through',
  'health.single_stock.detail_via': ' ({pct} via funds)',
  'health.sector.title': 'Single-sector weight',
  'health.sector.warn': '{list} exceed {limit}%',
  'health.sector.pass': 'The largest, "{name}", is {pct}',
  'health.account.title': 'Account (platform) spread',
  'health.account.none': 'No assets are assigned to accounts yet, so platform concentration cannot be assessed',
  'health.account.message': 'Assets are spread across {count} accounts; the largest, "{name}", holds {pct}',
  'health.account.over': ', above {limit}%',
  'health.account.unassigned': 'No account',
  'health.currency.title': 'Foreign-currency share',
  'health.currency.message': 'Non-{currency} assets are {pct}',
  'health.currency.over': ', above {limit}%; exchange-rate swings have a large impact',
  'health.drift.title': 'Allocation drift',
  'health.drift.none': 'No target allocation set yet',
  'health.drift.warn': '{count} categor(ies) drift beyond ±{band}%: {list}',
  'health.drift.pass': 'All categories are within ±{band}% of target',
  'health.target_sum.title': 'Target total',
  'health.target_sum.warn': 'Targets add up to {sum}%; they should total 100%',
  'health.emergency.title': 'Emergency fund',
  'health.emergency.message': 'Cash assets of {amount} cover about {months} months of expenses (target {target} months)',
  'health.emergency.unset': 'Cash assets: {amount}. Set your monthly expenses to see how many months they cover',
  'health.fees.title': 'Trading fee ratio',
  'health.fees.message': 'Total fees {amount}, {ratio}% of buy volume (limit {limit}%)',
  'health.stale.title': 'Valuations up to date',
  'health.stale.warn': '{count} asset(s) have stale valuations (priced > {market} days, manual > {manual} days)',
  'health.stale.pass': 'All valuations are current',
  'health.stale.detail': '{name}: last valued {date}',
  'health.stale.never': 'never',
  'health.fx.title': 'Exchange rates complete',
  'health.fx.fail': 'Missing exchange rates for {list}; those assets are converted 1:1 and totals will be badly off',
  'health.fx.pass': 'Every currency has an exchange rate',
  'health.components.title': 'Fund constituents',
  'health.components.warn': '{count} fund(s) have no constituents yet, so look-through will understate overlap',
  'health.components.pass': '{count} fund(s) have constituents',
  'health.components.none': 'No funds need constituents',
  'health.components_age.title': 'Constituent data age',
  'health.components_age.warn': '{count} fund(s) have constituent data older than 120 days; update from the latest report',
  'health.components_age.pass': 'All constituent data is within 120 days',
  'health.components_age.detail': '{name}: as of {date}',
  'health.components_age.unknown': 'unknown',
  'health.sector_missing.title': 'Stock sectors',
  'health.sector_missing.warn': '{count} directly held asset(s) have no sector, so sector exposure is incomplete',
  'health.sector_missing.pass': 'Every directly held asset has a sector',
  'health.account_missing.title': 'Asset accounts',
  'health.account_missing.info': '{count} asset(s) have no account',
  'health.detail.pct': '{name}: {pct}',
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { 'zh-CN': zh, en };

export type Params = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: Params = {}): string {
  const template = DICTS[locale][key] ?? DICTS[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export function isMessageKey(s: string): s is MessageKey {
  return s in zh;
}

/** 解析请求语言：X-Locale 优先，其次 Accept-Language */
export function resolveLocale(xLocale?: string | null, acceptLanguage?: string | null): Locale {
  const pick = (v: string) => (v.toLowerCase().startsWith('zh') ? 'zh-CN' : v.toLowerCase().startsWith('en') ? 'en' : null);
  if (xLocale) {
    const p = pick(xLocale);
    if (p) return p;
  }
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(',')) {
      const p = pick(part.trim());
      if (p) return p;
    }
  }
  return DEFAULT_LOCALE;
}
