/**
 * SQLite 连接管理（node:sqlite）
 *
 * 全站共用一个数据库文件（默认 data/tasks.db），进程内单例连接：
 * - tasks 表：监控任务（到货 / 价格 / Tab）
 * - shops 表：店铺评分记录
 *
 * 运行要求：Node.js >= 22.5（node:sqlite）
 */

import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

/**
 * node:sqlite 只在 Node 22+ 提供，而项目 @types/node 仍是 20.x，
 * 这里通过 createRequire 拿到运行时模块并自行声明最小类型，避免类型版本耦合。
 */
export interface SqliteStatement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown
}

export interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

interface SqliteModule {
  DatabaseSync: new (path: string) => SqliteDatabase
}

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as SqliteModule

/** 数据目录（可通过 DATA_DIR 覆盖，默认 <cwd>/data） */
export const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(process.cwd(), 'data')

/** 数据库文件路径 */
export const DB_PATH = resolve(DATA_DIR, 'tasks.db')

let db: SqliteDatabase | null = null
let dbErrorLogged = false

/**
 * 建表（幂等）
 */
const createTables = (instance: SqliteDatabase): void => {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    )
  `)
  instance.exec('CREATE INDEX IF NOT EXISTS idx_tasks_kind_user ON tasks (kind, user_id)')
  instance.exec('CREATE INDEX IF NOT EXISTS idx_tasks_kind_status ON tasks (kind, status)')

  instance.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  instance.exec('CREATE INDEX IF NOT EXISTS idx_shops_user ON shops (user_id, updated_at DESC)')

  // 店铺黑名单：按供应商标识过滤 Tab 商品，与评分表分开，语义更清晰
  instance.exec(`
    CREATE TABLE IF NOT EXISTS shop_blacklist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      supply_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      market_name TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, supply_id)
    )
  `)
  instance.exec(
    'CREATE INDEX IF NOT EXISTS idx_shop_blacklist_user ON shop_blacklist (user_id, created_at DESC)'
  )
}

/**
 * 获取数据库连接（懒初始化，进程内单例）
 */
export const getDb = (): SqliteDatabase | null => {
  if (db) {
    return db
  }

  try {
    // 目录 700：任务数据包含登录态凭证，仅服务进程用户可读
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
    const instance = new DatabaseSync(DB_PATH)

    // WAL 模式：写入不阻塞读取，异常退出后也能保持一致性
    instance.exec('PRAGMA journal_mode = WAL')
    instance.exec('PRAGMA synchronous = NORMAL')

    createTables(instance)

    db = instance
    console.log(`[DB] 已启用持久化: ${DB_PATH}`)
    return db
  } catch (error) {
    if (!dbErrorLogged) {
      dbErrorLogged = true
      console.error('[DB] 初始化失败，数据将仅保存在内存中:', error)
    }
    return null
  }
}

/**
 * 关闭数据库连接
 */
export const closeDb = (): void => {
  if (db) {
    try {
      db.close()
    } catch {
      // 忽略关闭异常
    }
    db = null
  }
}
