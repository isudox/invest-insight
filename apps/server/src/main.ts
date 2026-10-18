import { serve } from '@hono/node-server';
import { Cron } from 'croner';
import { loadConfig, VERSION } from './config.js';
import { closeDatabase, getSqlite, openDatabase } from './db/index.js';
import { createBackup, pruneBackups } from './db/backup.js';
import { bootstrapAdmin, countUsers } from './domain/auth.js';
import { createApp } from './http/app.js';
import { createLogger, log, setLogger } from './logger.js';

async function main() {
  const config = loadConfig();
  setLogger(createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development' && process.stdout.isTTY));
  log.info({ version: VERSION, node: process.version, dataDir: config.DATA_DIR }, 'Invest Insight 启动中');

  await openDatabase({ file: config.dbPath, migrationsDir: config.MIGRATIONS_DIR, backupDir: config.backupDir, locale: config.DEFAULT_LOCALE });
  bootstrapAdmin(config.ADMIN_USERNAME, config.ADMIN_PASSWORD);
  if (countUsers() === 0) log.warn('尚未配置登录账号：请设置 ADMIN_USERNAME / ADMIN_PASSWORD 后重启，或执行 `ii user add <用户名>`');

  // 定时自动备份
  let job: Cron | null = null;
  if (config.BACKUP_CRON !== 'off') {
    job = new Cron(config.BACKUP_CRON, { protect: true, catch: (err) => log.error({ err }, '自动备份失败') }, async () => {
      await createBackup(getSqlite(), config.backupDir, 'auto');
      pruneBackups(config.backupDir, config.BACKUP_KEEP);
    });
    log.info({ cron: config.BACKUP_CRON, keep: config.BACKUP_KEEP, next: job.nextRun()?.toISOString() }, '已启用自动备份');
  }

  const app = createApp(config);
  const server = serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
    log.info({ url: `http://${info.address}:${info.port}`, baseUrl: config.BASE_URL ?? null }, '服务已启动');
  });

  // 优雅退出：停止接收请求，checkpoint 后关闭数据库
  const shutdown = (signal: string) => {
    log.info({ signal }, '正在关闭');
    job?.stop();
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
    setTimeout(() => {
      closeDatabase();
      process.exit(0);
    }, 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.fatal({ err }, '启动失败');
  console.error(err);
  process.exit(1);
});
