import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { lookupSession } from '../domain/auth.js';
import { log } from '../logger.js';
import { expectedOrigin, tr, type AppEnv } from './context.js';

export const SESSION_COOKIE = 'ii_session';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 访问日志：一行一条，不记录 Cookie 等敏感信息 */
export const accessLog = createMiddleware<AppEnv>(async (c, next) => {
  const start = performance.now();
  await next();
  const path = new URL(c.req.url).pathname;
  if (path === '/healthz' || !path.startsWith('/api')) return;
  log.info({ method: c.req.method, path, status: c.res.status, ms: Math.round(performance.now() - start), user: c.get('user')?.username }, 'request');
});

/**
 * CSRF 防护：
 * - 写请求必须是 JSON（表单无法跨站伪造 application/json 请求）；
 * - 带 Origin 头时必须与本站来源一致。
 * 配合 SameSite=Lax 的会话 Cookie 使用。
 */
export const csrfGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (UNSAFE.has(c.req.method)) {
    const type = c.req.header('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) {
      return c.json({ error: tr(c, 'error.json_required') }, 415);
    }
    const origin = c.req.header('origin');
    if (origin && origin !== expectedOrigin(c)) {
      log.warn({ origin, expected: expectedOrigin(c) }, '拒绝跨站请求');
      return c.json({ error: tr(c, 'error.origin_rejected') }, 403);
    }
  }
  await next();
});

/** 除登录相关接口外，所有 /api 请求都需要有效会话 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? lookupSession(token, c.get('config').SESSION_DAYS) : null;
  if (!user) return c.json({ error: tr(c, 'error.login_required') }, 401);
  c.set('user', user);
  await next();
});
