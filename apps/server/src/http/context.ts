import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { User } from '@invest-insight/shared';
import type { ZodTypeAny, z } from 'zod';
import type { Config } from '../config.js';
import { translate, type Locale, type MessageKey, type Params } from '../i18n.js';

export type AppEnv = { Variables: { user: User; config: Config; locale: Locale } };
export type Ctx = Context<AppEnv>;

/** 业务错误：携带文案键，由全局错误处理按请求语言翻译 */
export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
    public key: MessageKey,
    public params: Params = {},
  ) {
    super(key);
  }
}

/** 按当前请求语言翻译 */
export const tr = (c: Ctx, key: MessageKey, params?: Params) => translate(c.get('locale') ?? 'zh-CN', key, params);

/** 解析并校验 JSON 请求体，校验失败由全局错误处理转成 400 */
export async function body<S extends ZodTypeAny>(c: Ctx, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'error.invalid_json');
  }
  return schema.parse(raw);
}

export function idParam(c: Ctx, name = 'id'): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'error.invalid_id');
  return n;
}

/** 客户端 IP：仅在开启 TRUST_PROXY 时信任 X-Forwarded-For */
export function clientIp(c: Ctx): string {
  if (c.get('config').TRUST_PROXY) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 对外访问是否为 HTTPS（决定 Cookie 的 Secure 标记） */
export function isHttps(c: Ctx): boolean {
  const cfg = c.get('config');
  if (cfg.BASE_URL) return cfg.BASE_URL.startsWith('https://');
  if (cfg.TRUST_PROXY && c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https') return true;
  return new URL(c.req.url).protocol === 'https:';
}

/** 允许的来源：配置了 BASE_URL 时只认它，否则认当前请求的 Host */
export function expectedOrigin(c: Ctx): string {
  const cfg = c.get('config');
  if (cfg.BASE_URL) return new URL(cfg.BASE_URL).origin;
  const proto = isHttps(c) ? 'https' : 'http';
  const host = (cfg.TRUST_PROXY && c.req.header('x-forwarded-host')?.split(',')[0]?.trim()) || c.req.header('host');
  return `${proto}://${host}`;
}
