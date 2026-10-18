import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/ 与 dist/ 都在 apps/server 下一层
const serverRoot = path.resolve(here, '..');

const bool = z
  .string()
  .optional()
  .transform((v) => v === '1' || v?.toLowerCase() === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATA_DIR: z.string().default(path.resolve(serverRoot, '../../data')),
  STATIC_DIR: z.string().default(path.resolve(serverRoot, '../web/dist')),
  MIGRATIONS_DIR: z.string().default(path.resolve(serverRoot, 'drizzle')),
  /** 对外访问地址，例如 https://invest.example.com，用于来源校验与 Cookie Secure 判断 */
  BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, '')),
  /** 位于反向代理之后时开启，信任 X-Forwarded-* 头 */
  TRUST_PROXY: bool,
  SESSION_DAYS: z.coerce.number().positive().default(7),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** 自动备份的 cron 表达式，设为 off 关闭 */
  BACKUP_CRON: z.string().default('0 3 * * *'),
  BACKUP_KEEP: z.coerce.number().int().min(1).default(14),
  /** 首次启动时默认资产类别等初始数据使用的语言 */
  DEFAULT_LOCALE: z.enum(['zh-CN', 'en']).default('zh-CN'),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { dbPath: string; backupDir: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`环境变量配置有误：${msg}`);
  }
  const c = parsed.data;
  const dataDir = path.resolve(c.DATA_DIR);
  return { ...c, DATA_DIR: dataDir, dbPath: path.join(dataDir, 'invest-insight.db'), backupDir: path.join(dataDir, 'backups') };
}

export const VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? '0.2.0';
