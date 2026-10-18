import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { loginInput } from '@invest-insight/shared';
import { authenticate, clearLoginFailures, countUsers, createSession, destroySession, loginLockedFor, recordLoginFailure } from '../../domain/auth.js';
import { log } from '../../logger.js';
import { body, clientIp, HttpError, isHttps, type AppEnv } from '../context.js';
import { SESSION_COOKIE } from '../middleware.js';

/** 登录 / 退出（账号由管理员通过命令行维护，不提供注册） */
export const authRoutes = new Hono<AppEnv>()
  .post('/login', async (c) => {
    const { username, password } = await body(c, loginInput);
    const key = `${clientIp(c)}|${username.toLowerCase()}`;
    const locked = loginLockedFor(key);
    if (locked > 0) throw new HttpError(429, 'error.too_many_attempts', { minutes: Math.ceil(locked / 60) });
    if (countUsers() === 0) throw new HttpError(503, 'error.no_users');
    const user = authenticate(username, password);
    if (!user) {
      recordLoginFailure(key);
      log.warn({ username, ip: clientIp(c) }, '登录失败');
      throw new HttpError(401, 'error.bad_credentials');
    }
    clearLoginFailures(key);
    const { token, expires } = createSession(user.id, c.get('config').SESSION_DAYS);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: isHttps(c), expires, path: '/' });
    log.info({ username: user.username, ip: clientIp(c) }, '登录成功');
    return c.json(user);
  })
  .post('/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) destroySession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
