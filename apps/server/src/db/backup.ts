import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { BackupInfo } from '@invest-insight/shared';
import { log } from '../logger.js';

const PREFIX = 'invest-insight-';
const KINDS: BackupInfo['kind'][] = ['auto', 'manual', 'pre-migration', 'pre-restore', 'legacy'];

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 用 SQLite 在线备份接口生成一致的快照，服务运行中也可安全执行。 */
export async function createBackup(sqlite: Database.Database, dir: string, kind: BackupInfo['kind']): Promise<BackupInfo> {
  fs.mkdirSync(dir, { recursive: true });
  let name = `${PREFIX}${stamp()}-${kind}.db`;
  for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = `${PREFIX}${stamp()}-${kind}-${i}.db`;
  const target = path.join(dir, name);
  await sqlite.backup(target);
  const info = describe(dir, name);
  log.info({ backup: name, size: info.size }, '已创建备份');
  return info;
}

function describe(dir: string, name: string): BackupInfo {
  const st = fs.statSync(path.join(dir, name));
  const kind = KINDS.find((k) => name.includes(`-${k}`)) ?? 'other';
  return { name, size: st.size, created_at: st.mtime.toISOString(), kind };
}

export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db') && isSafeName(f))
    .map((f) => describe(dir, f))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 自动备份与「导入 / 清空前」备份各保留最近 keep 份；手动、迁移前与旧版数据备份不自动删除 */
export function pruneBackups(dir: string, keep: number) {
  for (const kind of ['auto', 'pre-restore'] as const) {
    for (const b of listBackups(dir)
      .filter((x) => x.kind === kind)
      .slice(keep)) {
      fs.rmSync(path.join(dir, b.name), { force: true });
      log.info({ backup: b.name }, '已清理过期的备份');
    }
  }
}

/** 只允许访问备份目录下的普通文件名，防止路径穿越 */
export function isSafeName(name: string) {
  return /^[\w.-]+\.db$/.test(name) && !name.includes('..');
}
