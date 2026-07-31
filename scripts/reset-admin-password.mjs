#!/usr/bin/env node
/**
 * 文件功能：一次性重置 admin 用户的密码（bcrypt 加盐哈希）
 * 使用方法：node scripts/reset-admin-password.mjs <username> <newPassword>
 *
 * 设计说明：
 * - 走 better-sqlite3 直连项目根 data/app.db，避开 Express 中间件与 Zod 校验。
 * - 仅修改 password_hash 字段，不动 role / alias / permissions / created_at。
 * - 结束后打印更新行数与当前用户名，方便核对。
 */
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. 参数解析
const [, , username, rawPassword] = process.argv;
if (!username || !rawPassword) {
    console.error('用法: node scripts/reset-admin-password.mjs <username> <newPassword>');
    process.exit(1);
}
if (rawPassword.length < 6) {
    console.error('[错误] 新密码长度至少 6 位（与 AuthCredentialsSchema 保持一致）');
    process.exit(1);
}

// 2. 计算数据库路径
//    桌面版：%APPDATA%/xiaohongyi/data/app.db
//    开发版：<repo>/data/app.db
//    这里优先尝试环境变量 XIAOHONGYI_USER_DATA，否则用仓库根的 data 目录
const repoRoot = path.resolve(__dirname, '..');
const userDataDir = process.env.XIAOHONGYI_USER_DATA || repoRoot;
const dbPath = path.join(userDataDir, 'data', 'app.db');

console.log(`[reset-admin] 数据库: ${dbPath}`);

// 3. 打开数据库
const db = new Database(dbPath);

// 4. 查找目标用户
const user = db.prepare('SELECT id, username, role FROM admin_users WHERE username = ?').get(username);
if (!user) {
    console.error(`[错误] 找不到用户: ${username}`);
    process.exit(2);
}
console.log(`[reset-admin] 找到用户: id=${user.id}, role=${user.role}`);

// 5. bcrypt 加盐哈希（与 AuthService.registerFirstAdmin 保持一致）
const salt = await bcrypt.genSalt(10);
const hash = await bcrypt.hash(rawPassword, salt);

// 6. 更新密码
const result = db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
console.log(`[reset-admin] 更新行数: ${result.changes}`);
console.log(`[reset-admin] 完成。新密码: ${rawPassword}`);
console.log('[reset-admin] 请立即使用新密码登录，并在登录后修改为更易记的强密码。');

db.close();
