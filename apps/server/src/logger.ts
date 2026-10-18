import pino from 'pino';

/**
 * 生产环境输出单行 JSON 到 stdout，便于 docker logs / Loki 收集；
 * 本地开发时如安装了 pino-pretty 则输出易读格式。
 */
export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: ['req.headers.cookie', 'password', '*.password'], remove: true },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;

// 未初始化前（如单元测试）使用静默 logger
export let log: Logger = pino({ level: 'silent' });
export function setLogger(l: Logger) {
  log = l;
}
