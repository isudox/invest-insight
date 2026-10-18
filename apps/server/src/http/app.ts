import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { Config } from '../config.js';
import { getSqlite } from '../db/index.js';
import { log } from '../logger.js';
import { isMessageKey, resolveLocale } from '../i18n.js';
import { HttpError, tr, type AppEnv } from './context.js';
import { accessLog, csrfGuard, requireAuth } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { insightRoutes } from './routes/insights.js';
import { accountRoutes, assetRoutes, categoryRoutes, goalRoutes, transactionRoutes } from './routes/records.js';
import { systemRoutes } from './routes/system.js';

export function createApp(config: Config) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('config', config);
    c.set('locale', resolveLocale(c.req.header('x-locale'), c.req.header('accept-language')));
    await next();
  });
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React 的 style 属性需要 inline 样式
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
      // 是否启用 HSTS 交给反向代理决定，避免在纯 HTTP 内网访问时出问题
      strictTransportSecurity: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use('*', accessLog);

  // 健康检查：不需要登录，供 Docker HEALTHCHECK / Uptime Kuma 使用
  app.get('/healthz', (c) => {
    try {
      getSqlite().prepare('SELECT 1').get();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'error' }, 503);
    }
  });

  const api = new Hono<AppEnv>();
  api.use('*', bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.json({ error: tr(c, 'error.body_too_large') }, 413) }));
  api.use('*', csrfGuard);
  api.route('/auth', authRoutes);
  api.use('*', requireAuth);
  api.route('/', systemRoutes);
  api.route('/', insightRoutes);
  api.route('/categories', categoryRoutes);
  api.route('/accounts', accountRoutes);
  api.route('/assets', assetRoutes);
  api.route('/transactions', transactionRoutes);
  api.route('/goals', goalRoutes);
  api.all('*', (c) => c.json({ error: tr(c, 'error.not_found') }, 404));
  app.route('/api', api);

  // 生产模式：托管前端构建产物，并为前端路由回退到 index.html
  const staticDir = config.STATIC_DIR;
  const indexFile = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    const root = path.relative(process.cwd(), staticDir) || '.';
    app.use('/assets/*', async (c, next) => {
      await next();
      if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    });
    app.use(
      '*',
      serveStatic({
        root,
        onFound: (p, c) => {
          if (/(index\.html|sw\.js|manifest\.webmanifest|registerSW\.js)$/.test(p)) c.header('Cache-Control', 'no-cache');
        },
      }),
    );
    const html = fs.readFileSync(indexFile, 'utf8');
    app.get('*', (c) => {
      c.header('Cache-Control', 'no-cache');
      return c.html(html);
    });
  } else {
    log.info({ staticDir }, '未找到前端构建产物，仅提供 API（开发模式请访问 Vite 的地址）');
  }

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      const text = err.issues.map((i) => {
        // 自定义规则的 message 是文案键；其余按 Zod 的错误类型给出通用说明
        const key = `validation.${i.message}`;
        const message = isMessageKey(key)
          ? tr(c, key)
          : tr(
              c,
              i.code === 'too_small'
                ? 'validation.too_small'
                : i.code === 'too_big'
                  ? 'validation.too_big'
                  : i.code === 'invalid_type' && i.received === 'undefined'
                    ? 'validation.required'
                    : 'validation.invalid',
            );
        return tr(c, 'validation.field', { field: i.path.join('.') || tr(c, 'validation.param'), message });
      });
      return c.json({ error: text.join(tr(c, 'validation.separator')) }, 400);
    }
    if (err instanceof HttpError) return c.json({ error: tr(c, err.key, err.params) }, err.status);
    const message = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint/.test(message)) return c.json({ error: tr(c, 'error.duplicate_name') }, 409);
    if (/FOREIGN KEY constraint/.test(message)) return c.json({ error: tr(c, 'error.foreign_key') }, 400);
    log.error({ err, path: c.req.path }, '未处理的错误');
    return c.json({ error: tr(c, 'error.internal') }, 500);
  });

  return app;
}
