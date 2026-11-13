/**
 * 任务数据 v1 → v2 离线迁移
 *
 * 用法（在仓库根目录）：
 *   npx tsx scripts/migrate-tasks-v2.ts --dry-run
 *   npx tsx scripts/migrate-tasks-v2.ts --apply
 *   npx tsx scripts/migrate-tasks-v2.ts --db /var/www/shopping-assistant/data/tasks.db --apply
 *
 * 行为：
 *   - 默认 dry-run，只统计不写库
 *   - --apply 前自动备份数据库（VACUUM INTO，一致性快照）
 *   - 每行 version>=2 直接跳过，可重复执行
 *   - 单行失败只记录，不中断；退出码非 0 表示有失败
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { migrateLegacyRecord } from '../web/server/tasks/engine/legacy-migrate'
import type { TaskKind } from '../src/contract'

interface SqliteStatement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown
}
interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}
interface SqliteModule {
  DatabaseSync: new (path: string) => SqliteDatabase
}

interface Row {
  kind: string
  id: string
  user_id: string
  payload: string
  version: number
  secret: string
}

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as SqliteModule

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dbArgIndex = args.indexOf('--db')
const dbPath = resolve(
  dbArgIndex >= 0 && args[dbArgIndex + 1]
    ? args[dbArgIndex + 1]
    : resolve(process.cwd(), 'data/tasks.db')
)

if (!existsSync(dbPath)) {
  console.error(`数据库不存在: ${dbPath}`)
  process.exit(1)
}

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL')

// 1. 补列（与 db.ts 保持一致的幂等逻辑）
const columns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
const names = new Set(columns.map(column => column.name))
for (const [column, definition] of [
  ['version', 'INTEGER NOT NULL DEFAULT 0'],
  ['secret', "TEXT NOT NULL DEFAULT ''"],
] as const) {
  if (!names.has(column)) {
    console.log(`[migrate] 新增列 ${column}`)
    db.exec(`ALTER TABLE tasks ADD COLUMN ${column} ${definition}`)
  }
}

// 2. 备份
if (apply) {
  const backup = `${dbPath}.bak.${Date.now()}`
  mkdirSync(dirname(backup), { recursive: true })
  try {
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
    console.log(`[migrate] 已备份: ${backup}`)
  } catch (error) {
    copyFileSync(dbPath, backup)
    console.warn(`[migrate] VACUUM 备份失败，已退化为文件复制: ${backup}`, error)
  }
}

// 3. 逐行迁移
const rows = db.prepare('SELECT kind, id, user_id, payload, version, secret FROM tasks ORDER BY kind, created_at').all() as Row[]
const stats: Record<string, { total: number; migrated: number; skipped: number; failed: number }> = {}
const failures: Array<{ kind: string; id: string; reason: string }> = []

for (const row of rows) {
  const stat = (stats[row.kind] ??= { total: 0, migrated: 0, skipped: 0, failed: 0 })
  stat.total++

  if (Number(row.version) >= 2) {
    stat.skipped++
    continue
  }

  try {
    const raw = JSON.parse(row.payload || '{}') as Record<string, any>
    const migrated = migrateLegacyRecord(row.kind as TaskKind, raw)
    const payload = JSON.stringify({
      version: 2,
      state: migrated.state,
      ...(migrated.accountId ? { accountId: migrated.accountId } : {}),
    })
    const secret = migrated.secret ? JSON.stringify(migrated.secret) : ''

    if (apply) {
      db.prepare(
        'UPDATE tasks SET payload = ?, secret = ?, version = 2, updated_at = ? WHERE kind = ? AND id = ?'
      ).run(payload, secret, Date.now(), row.kind, row.id)
    }
    stat.migrated++
  } catch (error) {
    stat.failed++
    failures.push({
      kind: row.kind,
      id: row.id,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

console.log(`\n[migrate] ${apply ? '已执行' : '预演（未写库）'}：${dbPath}`)
for (const [kind, stat] of Object.entries(stats)) {
  console.log(
    `  ${kind.padEnd(6)} 共 ${stat.total}，迁移 ${stat.migrated}，跳过 ${stat.skipped}，失败 ${stat.failed}`
  )
}
if (failures.length) {
  console.error('\n失败明细：')
  for (const item of failures) console.error(`  ${item.kind}/${item.id}: ${item.reason}`)
}

db.close()

if (failures.length > 0) process.exit(1)
if (!apply) console.log('\n下一步：确认无误后加 --apply 正式执行（会先自动备份）\n')
