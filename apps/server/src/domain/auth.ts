import crypto from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import type { User } from '@invest-insight/shared';
import { getDb } from '../db/index.js';
import { loginAttempts, sessions, users } from '../db/schema.js';
import { log } from '../logger.js';

export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_PATTERN = /^[\w.@-]{2,40}$/;

// ---------- 密码（scrypt，纯 JS 无需原生依赖） ----------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

// 用户不存在时也做一次等价计算，避免通过响应时间探测用户名
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- 账号 ----------

const norm = (u: string) => u.trim().toLowerCase();

export function countUsers(): number {
  return getDb()
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .get()!.n;
}

export function findUser(username: string) {
  return getDb()
    .select()
    .from(users)
    .where(eq(users.username, norm(username)))
    .get();
}

export function listUsers() {
  return getDb().select({ username: users.username, created_at: users.created_at, last_login_at: users.last_login_at }).from(users).orderBy(users.id).all();
}

export function createUser(username: string, password: string) {
  getDb()
    .insert(users)
    .values({ username: norm(username), password_hash: hashPassword(password) })
    .run();
}

export function setPassword(username: string, password: string): boolean {
  const user = findUser(username);
  if (!user) return false;
  getDb()
    .update(users)
    .set({ password_hash: hashPassword(password) })
    .where(eq(users.id, user.id))
    .run();
  // 修改密码后让该账号所有会话失效
  getDb().delete(sessions).where(eq(sessions.user_id, user.id)).run();
  return true;
}

export function removeUser(username: string): boolean {
  return (
    getDb()
      .delete(users)
      .where(eq(users.username, norm(username)))
      .run().changes > 0
  );
}

export function authenticate(username: string, password: string): User | null {
  const user = findUser(username);
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  getDb()
    .update(users)
    .set({ last_login_at: sql`datetime('now')` })
    .where(eq(users.id, user.id))
    .run();
  return { id: user.id, username: user.username };
}

/** 首次启动且没有任何账号时，可用环境变量创建初始管理员 */
export function bootstrapAdmin(username?: string, password?: string) {
  if (countUsers() > 0 || !username?.trim() || !password) return;
  if (!USERNAME_PATTERN.test(username.trim())) {
    log.warn('ADMIN_USERNAME 格式不合法，未创建账号');
    return;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    log.warn(`ADMIN_PASSWORD 至少需要 ${PASSWORD_MIN_LENGTH} 位，未创建账号`);
    return;
  }
  createUser(username, password);
  log.info({ username: norm(username) }, '已根据环境变量创建初始账号');
}

// ---------- 会话 ----------

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId: number, days: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + days * 86400000);
  const db = getDb();
  db.delete(sessions).where(lt(sessions.expires_at, Date.now())).run();
  db.insert(sessions)
    .values({ token_hash: sha256(token), user_id: userId, expires_at: expires.getTime() })
    .run();
  return { token, expires };
}

export function destroySession(token: string) {
  getDb()
    .delete(sessions)
    .where(eq(sessions.token_hash, sha256(token)))
    .run();
}

export function lookupSession(token: string, days: number): User | null {
  const db = getDb();
  const row = db
    .select({ id: users.id, username: users.username, expires_at: sessions.expires_at })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(eq(sessions.token_hash, sha256(token)))
    .get();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(token);
    return null;
  }
  // 滑动续期：剩余不足一半时延长
  const ms = days * 86400000;
  if (row.expires_at - Date.now() < ms / 2) {
    db.update(sessions)
      .set({ expires_at: Date.now() + ms })
      .where(eq(sessions.token_hash, sha256(token)))
      .run();
  }
  return { id: row.id, username: row.username };
}

// ---------- 登录失败限流（持久化） ----------

const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;

export function loginLockedFor(key: string): number {
  const row = getDb().select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
  if (!row || row.locked_until <= Date.now()) return 0;
  return Math.ceil((row.locked_until - Date.now()) / 1000);
}

export function recordLoginFailure(key: string) {
  const db = getDb();
  const now = Date.now();
  const row = db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
  const reset = !row || now - row.first_at > WINDOW_MS || (row.locked_until > 0 && row.locked_until <= now);
  const count = reset ? 1 : row!.count + 1;
  const next = { key, count, first_at: reset ? now : row!.first_at, locked_until: count >= MAX_FAILURES ? now + WINDOW_MS : 0 };
  db.insert(loginAttempts).values(next).onConflictDoUpdate({ target: loginAttempts.key, set: next }).run();
  // 顺带清理过期记录
  db.delete(loginAttempts)
    .where(sql`${loginAttempts.first_at} < ${now - 24 * 3600 * 1000} AND ${loginAttempts.locked_until} < ${now}`)
    .run();
}

export function clearLoginFailures(key: string) {
  getDb().delete(loginAttempts).where(eq(loginAttempts.key, key)).run();
}
