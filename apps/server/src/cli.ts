/**
 * 管理命令行（在服务器 / 容器内使用）：
 *
 *   ii user list | add <用户名> | passwd <用户名> | remove <用户名>
 *   ii backup list | create
 *   ii backup restore <文件名>      恢复前请先停止服务
 *
 * Docker 中：docker exec -it invest-insight ii user add admin
 * 源码运行：pnpm user add admin
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from './config.js';
import { closeDatabase, getSqlite, openDatabase } from './db/index.js';
import { createBackup, isSafeName, listBackups } from './db/backup.js';
import { createUser, findUser, listUsers, PASSWORD_MIN_LENGTH, removeUser, setPassword, USERNAME_PATTERN } from './domain/auth.js';

const [group, command, arg] = process.argv.slice(2);

function usage(): never {
  console.log(`用法:
  ii user list                  列出所有账号
  ii user add <用户名>          新增账号
  ii user passwd <用户名>       重置密码（该账号会被强制下线）
  ii user remove <用户名>       删除账号
  ii backup list                列出备份
  ii backup create              立即创建一份备份
  ii backup restore <文件名>    用备份覆盖当前数据库（请先停止服务）`);
  process.exit(1);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function readStdinLine(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return '';
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const r = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    r._writeToOutput = (s: string) => {
      if (!muted || s === '\r\n' || s === '\n') r.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

/** 交互终端中隐藏输入并确认；非交互环境（管道）读取第一行 */
async function askPassword(): Promise<string> {
  let password: string;
  if (process.stdin.isTTY) {
    password = await promptHidden('密码: ');
    if (password !== (await promptHidden('再次输入密码: '))) fail('两次输入的密码不一致');
  } else {
    password = await readStdinLine();
  }
  if (password.length < PASSWORD_MIN_LENGTH) fail(`密码至少需要 ${PASSWORD_MIN_LENGTH} 位`);
  return password;
}

function requireName(): string {
  const name = arg?.trim();
  if (!name) usage();
  if (!USERNAME_PATTERN.test(name)) fail('用户名只能包含字母、数字、下划线、点、@ 和 -，长度 2–40');
  return name;
}

async function main() {
  const config = loadConfig();
  if (!group || !command) usage();

  if (group === 'backup' && command === 'restore') {
    // 恢复直接替换文件，不经过打开数据库
    if (!arg || !isSafeName(arg)) fail('请指定 backups 目录下的备份文件名，可用 ii backup list 查看');
    const src = path.join(config.backupDir, arg);
    if (!fs.existsSync(src)) fail(`找不到备份 ${arg}`);
    if (fs.existsSync(config.dbPath)) {
      await openDatabase({ file: config.dbPath, migrationsDir: config.MIGRATIONS_DIR, backupDir: config.backupDir });
      const info = await createBackup(getSqlite(), config.backupDir, 'pre-restore');
      closeDatabase();
      console.log(`已先备份当前数据库为 ${info.name}`);
    }
    for (const suffix of ['-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
    fs.copyFileSync(src, config.dbPath);
    console.log(`✓ 已恢复 ${arg}，启动服务时会自动执行必要的迁移`);
    return;
  }

  await openDatabase({ file: config.dbPath, migrationsDir: config.MIGRATIONS_DIR, backupDir: config.backupDir });
  try {
    if (group === 'user') {
      switch (command) {
        case 'list': {
          const rows = listUsers();
          if (!rows.length) console.log('（暂无账号）');
          else console.table(rows.map((r) => ({ 用户名: r.username, 创建时间: r.created_at, 最近登录: r.last_login_at ?? '—' })));
          break;
        }
        case 'add': {
          const name = requireName();
          if (findUser(name)) fail(`账号 ${name} 已存在，如需改密码请用 passwd`);
          createUser(name, await askPassword());
          console.log(`✓ 已创建账号 ${name.toLowerCase()}`);
          break;
        }
        case 'passwd': {
          const name = requireName();
          if (!findUser(name)) fail(`账号 ${name} 不存在`);
          setPassword(name, await askPassword());
          console.log(`✓ 已重置 ${name} 的密码，原有登录会话已失效`);
          break;
        }
        case 'remove': {
          if (!removeUser(requireName())) fail(`账号 ${arg} 不存在`);
          console.log(`✓ 已删除账号 ${arg}`);
          break;
        }
        default:
          usage();
      }
    } else if (group === 'backup') {
      if (command === 'list') {
        const rows = listBackups(config.backupDir);
        if (!rows.length) console.log('（暂无备份）');
        else console.table(rows.map((b) => ({ 文件: b.name, 类型: b.kind, 大小KB: Math.round(b.size / 1024), 时间: b.created_at })));
      } else if (command === 'create') {
        const info = await createBackup(getSqlite(), config.backupDir, 'manual');
        console.log(`✓ 已创建 ${path.join(config.backupDir, info.name)}`);
      } else usage();
    } else usage();
  } finally {
    closeDatabase();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
