/**
 * 任务持久化（SQLite）
 *
 * 唯一碰 SQL 的任务模块。对外只暴露「行」的读写：
 *   - payload = { version, state }
 *   - secret   = AdapterConfig（独立列，永远不会出现在 project / 接口响应里）
 *
 * 高频进度用节流写入（1 秒），创建/状态变更/删除立即落盘。
 */

import type { AdapterConfig, TaskKind, TaskStatus } from '@core/contract'
import { getDb } from '../../utils/db'

/** 落盘任务行（不含 controller） */
export interface StoredTaskRow<S = unknown> {
  kind: TaskKind
  id: string
  userId: string
  userEmail: string
  status: TaskStatus
  createdAt: Date
  updatedAt: Date
  version: number
  state: S
  accountId?: string
  secret: AdapterConfig | null
}

interface RawRow {
  kind: string
  id: string
  user_id: string
  user_email: string
  status: string
  created_at: number
  updated_at: number
  version: number
  payload: string
  secret: string
}

const PERSIST_THROTTLE_MS = 1000

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingRows = new Map<string, StoredTaskRow>()

const keyOf = (kind: TaskKind, id: string) => `${kind}:${id}`

/** 序列化：只写 version + state；controller / secret 不进 payload */
const serialize = (row: StoredTaskRow): string =>
  JSON.stringify({ version: row.version, state: row.state, accountId: row.accountId ?? '' })

const deserialize = <S>(raw: RawRow): StoredTaskRow<S> => {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(raw.payload) as Record<string, unknown>
  } catch {
    parsed = {}
  }

  // v2：{ version, state }；v0/v1：payload 本身就是扁平状态
  const version = Number(raw.version) || Number(parsed.version) || 0
  const state = (version >= 2 ? parsed.state : parsed) as S

  let secret: AdapterConfig | null = null
  if (raw.secret) {
    try {
      secret = JSON.parse(raw.secret) as AdapterConfig
    } catch {
      secret = null
    }
  }

  return {
    kind: raw.kind as TaskKind,
    id: raw.id,
    userId: raw.user_id,
    userEmail: raw.user_email,
    status: raw.status as TaskStatus,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
    version,
    state,
    ...(parsed.accountId ? { accountId: String(parsed.accountId) } : {}),
    secret,
  }
}

/** 立即写入 */
export const saveTask = (row: StoredTaskRow): void => {
  const key = keyOf(row.kind, row.id)
  const timer = pendingTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    pendingTimers.delete(key)
  }
  pendingRows.delete(key)

  const db = getDb()
  if (!db) return

  try {
    db.prepare(`
      INSERT INTO tasks (kind, id, user_id, user_email, status, created_at, updated_at, version, payload, secret)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, id) DO UPDATE SET
        user_id = excluded.user_id,
        user_email = excluded.user_email,
        status = excluded.status,
        updated_at = excluded.updated_at,
        version = excluded.version,
        payload = excluded.payload,
        secret = excluded.secret
    `).run(
      row.kind,
      row.id,
      row.userId,
      row.userEmail,
      row.status,
      row.createdAt.getTime(),
      row.updatedAt.getTime(),
      row.version,
      serialize(row),
      row.secret ? JSON.stringify(row.secret) : ''
    )
  } catch (error) {
    console.error(`[TaskStore] 写入任务 ${key} 失败:`, error)
  }
}

/** 节流写入（进度更新） */
export const saveTaskSoon = (row: StoredTaskRow): void => {
  const key = keyOf(row.kind, row.id)
  pendingRows.set(key, row)

  if (pendingTimers.has(key)) return

  const timer = setTimeout(() => {
    pendingTimers.delete(key)
    const pending = pendingRows.get(key)
    pendingRows.delete(key)
    if (pending) saveTask(pending)
  }, PERSIST_THROTTLE_MS)

  if (typeof timer.unref === 'function') timer.unref()
  pendingTimers.set(key, timer)
}

/** 删除 */
export const removeTask = (kind: TaskKind, id: string): void => {
  const key = keyOf(kind, id)
  const timer = pendingTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    pendingTimers.delete(key)
  }
  pendingRows.delete(key)

  const db = getDb()
  if (!db) return
  try {
    db.prepare('DELETE FROM tasks WHERE kind = ? AND id = ?').run(kind, id)
  } catch (error) {
    console.error(`[TaskStore] 删除任务 ${key} 失败:`, error)
  }
}

/** 按 kind 查询（可按用户过滤），created_at 倒序 */
export const listTasks = <S>(kind: TaskKind, userId?: string): StoredTaskRow<S>[] => {
  const db = getDb()
  if (!db) return []

  try {
    const rows = (
      userId
        ? db
            .prepare('SELECT * FROM tasks WHERE kind = ? AND user_id = ? ORDER BY created_at DESC')
            .all(kind, userId)
        : db.prepare('SELECT * FROM tasks WHERE kind = ? ORDER BY created_at DESC').all(kind)
    ) as RawRow[]

    return rows.map(row => deserialize<S>(row))
  } catch (error) {
    console.error(`[TaskStore] 查询任务列表失败 (${kind}):`, error)
    return []
  }
}

/** 查单条 */
export const getTask = <S>(kind: TaskKind, id: string): StoredTaskRow<S> | null => {
  const db = getDb()
  if (!db) return null

  try {
    const row = db
      .prepare('SELECT * FROM tasks WHERE kind = ? AND id = ?')
      .get(kind, id) as RawRow | undefined
    return row ? deserialize<S>(row) : null
  } catch (error) {
    console.error(`[TaskStore] 查询任务 ${id} 失败:`, error)
    return null
  }
}

/** 重启后续跑：仍处于 running 的任务 */
export const listRunningTasks = <S>(kind: TaskKind): StoredTaskRow<S>[] => {
  const db = getDb()
  if (!db) return []

  try {
    const rows = db
      .prepare("SELECT * FROM tasks WHERE kind = ? AND status = 'running' ORDER BY created_at ASC")
      .all(kind) as RawRow[]
    return rows.map(row => deserialize<S>(row))
  } catch (error) {
    console.error(`[TaskStore] 查询运行中任务失败 (${kind}):`, error)
    return []
  }
}

/** 进程退出前刷盘 */
export const flushTasks = (): void => {
  const rows = Array.from(pendingRows.values())
  for (const timer of pendingTimers.values()) clearTimeout(timer)
  pendingTimers.clear()
  pendingRows.clear()
  for (const row of rows) saveTask(row)
}
