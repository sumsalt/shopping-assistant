#!/usr/bin/env node
/**
 * 账号同步：主服务器 -> 测试服务器（仅 accounts 表）
 *
 * 用途：把主线（43.143.118.204）的账号列表镜像到测试服务器（1.13.23.184）。
 * 这是一个「窄同步」脚本，边界非常明确：
 *   - 只覆盖 accounts 表；tasks / shops / settings / sessions 一概不动。
 *   - 覆盖前自动把测试服务器当前 accounts 备份到 data/accounts.bak.<时间戳>.json（600）。
 *   - 默认保留测试服务器【当前激活账号】：主线数据里若有同手机号的账号则设回激活，
 *     否则沿用主线激活态。传 --mirror-active 可改为完全跟随主线激活账号。
 *   - 账号数据经 base64 走加密 SSH 传输，全程不落明文盘。
 *
 * 安全：
 *   - 密码不写进本文件。优先读环境变量 SSH_PASSWORD，其次读 scripts/.sync-accounts.env
 *     （格式 SSH_PASSWORD=xxx，该文件已加入 .gitignore）。
 *   - 依赖本地已安装 sshpass。
 *
 * 用法：
 *   SSH_PASSWORD=xxx node scripts/sync-accounts.mjs            # 执行同步
 *   node scripts/sync-accounts.mjs --dry-run                   # 只预览两端差异，不写入
 *   node scripts/sync-accounts.mjs --mirror-active             # 激活账号也跟随主线
 *   node scripts/sync-accounts.mjs --src IP --dst IP           # 覆盖源/目标主机
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ==================== 配置（环境变量可覆盖） ====================
const SRC_HOST = process.env.SYNC_SRC || '43.143.118.204'
const DST_HOST = process.env.SYNC_DST || '1.13.23.184'
const SSH_USER = process.env.SYNC_USER || 'ubuntu'
const SSH_PORT = process.env.SYNC_PORT || '22'
const REMOTE_DIR = '/var/www/shopping-assistant'

// ==================== 参数解析 ====================
const argv = process.argv.slice(2)
const take = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined
}
const DRY_RUN = argv.includes('--dry-run')
const MIRROR_ACTIVE = argv.includes('--mirror-active')
const src = take('--src') || SRC_HOST
const dst = take('--dst') || DST_HOST

// ==================== 读取 SSH 密码 ====================
const readPassword = () => {
  if (process.env.SSH_PASSWORD) return process.env.SSH_PASSWORD
  const envFile = resolve(__dirname, '.sync-accounts.env')
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s.startsWith('SSH_PASSWORD='))
    if (line) return line.slice('SSH_PASSWORD='.length).trim()
  }
  return ''
}
const PASSWORD = readPassword()
if (!PASSWORD) {
  console.error('✗ 未找到 SSH 密码。请设置环境变量 SSH_PASSWORD，或在 scripts/.sync-accounts.env 写入 SSH_PASSWORD=xxx')
  process.exit(1)
}

// ==================== SSH 封装（sshpass -e 从环境变量取密码） ====================
const ssh = (host, remoteCmd, stdin) =>
  execFileSync(
    'sshpass',
    [
      '-e',
      'ssh',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'BatchMode=no',
      '-o',
      'LogLevel=ERROR',
      '-p',
      SSH_PORT,
      `${SSH_USER}@${host}`,
      `cd ${REMOTE_DIR} && ${remoteCmd}`,
    ],
    {
      env: { ...process.env, SSHPASS: PASSWORD },
      input: stdin,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    }
  )

/** 把一段 node 代码 base64 内联，远端用 node -e eval 执行，避免引号转义问题 */
const nodeRemote = (host, js, stdin) =>
  ssh(host, `node -e "eval(Buffer.from('${Buffer.from(js).toString('base64')}', 'base64').toString())"`, stdin)

// ==================== 远端代码：导出 accounts 为 JSON ====================
const EXPORT_JS = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/tasks.db');
const rows = db.prepare('SELECT * FROM accounts ORDER BY updated_at DESC, created_at DESC').all();
process.stdout.write(JSON.stringify(rows));
db.close();
`

// ==================== 远端代码：从 stdin 读 JSON，事务覆盖 accounts ====================
const IMPORT_JS = `
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const MIRROR_ACTIVE = ${MIRROR_ACTIVE ? 'true' : 'false'};
const DRY_RUN = ${DRY_RUN ? 'true' : 'false'};
const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Array.isArray(rows)) throw new Error('导入数据不是数组');
const db = new DatabaseSync('data/tasks.db');
db.exec('PRAGMA busy_timeout = 5000');

// 目标库当前列（以目标表结构为准，兼容两端列顺序差异）
const cols = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name);
const useCols = cols.filter((c) => rows.length === 0 || Object.prototype.hasOwnProperty.call(rows[0], c));
const placeholders = useCols.map(() => '?').join(',');

// 记录副线当前激活账号（用于保留）
const before = db.prepare('SELECT * FROM accounts').all();
const active = before.find((r) => r.is_active === 1) || null;

if (DRY_RUN) {
  console.log(JSON.stringify({ dryRun: true, before: before.length, incoming: rows.length, active: active && active.phone }));
  db.close();
  process.exit(0);
}

// 备份当前 accounts（含凭据，600 权限，落在 data/ 下，已被 .gitignore 忽略）
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backupPath = 'data/accounts.bak.' + stamp + '.json';
fs.writeFileSync(backupPath, JSON.stringify(before), { mode: 0o600 });

db.exec('BEGIN IMMEDIATE');
try {
  db.exec('DELETE FROM accounts');
  const stmt = db.prepare('INSERT INTO accounts (' + useCols.join(',') + ') VALUES (' + placeholders + ')');
  for (const r of rows) {
    stmt.run(...useCols.map((c) => (r[c] === undefined || r[c] === null ? '' : r[c])));
  }
  // 激活账号：默认保留目标端当前激活账号（按手机号匹配新数据）；--mirror-active 则完全跟随主线
  if (!MIRROR_ACTIVE && active) {
    const match = rows.find((r) => r.phone === active.phone) || rows.find((r) => r.id === active.id);
    if (match) {
      db.exec('UPDATE accounts SET is_active = 0');
      db.prepare('UPDATE accounts SET is_active = 1 WHERE id = ?').run(match.id);
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

const after = db.prepare('SELECT * FROM accounts').all();
const nowActive = after.find((r) => r.is_active === 1);
console.log(JSON.stringify({
  before: before.length,
  after: after.length,
  backup: backupPath,
  activeKept: !MIRROR_ACTIVE ? Boolean(active) : false,
  activePhone: nowActive ? nowActive.phone : null,
}));
db.close();
`

// ==================== 主流程 ====================
const main = () => {
  console.log(`源: ${src}  目标: ${dst}  用户: ${SSH_USER}  模式: ${DRY_RUN ? 'DRY-RUN' : '写入'}`)

  console.log(`\n[1/2] 从源服务器读取账号列表...`)
  const json = nodeRemote(src, EXPORT_JS).trim()
  const rows = JSON.parse(json)
  console.log(`  读到 ${rows.length} 条账号；user_id=${[...new Set(rows.map((r) => r.user_id))].join(',')}`)

  console.log(`\n[2/2] ${DRY_RUN ? '预览' : '写入'}目标服务器 accounts 表...`)
  const result = nodeRemote(dst, IMPORT_JS, json).trim()
  console.log(`  ${result}`)

  console.log(
    DRY_RUN
      ? '\n✓ 预览完成，未写入任何数据。'
      : '\n✓ 同步完成。仅 accounts 表被覆盖，其余表未改动；原 accounts 已备份。'
  )
}

try {
  main()
} catch (e) {
  console.error('\n✗ 同步失败:', e.stderr?.toString()?.trim() || e.message)
  process.exit(1)
}
