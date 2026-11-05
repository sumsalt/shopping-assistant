/**
 * 监控任务持久化存储（node:sqlite）
 *
 * 设计要点：
 * 1. 内存 Map 仍是运行时的工作副本（需要持有 AbortController），数据库作为落盘副本
 * 2. 高频进度更新走节流写入（默认 1 秒一次），状态变更 / 创建 / 删除立即落盘
 * 3. 读取时优先用内存，内存没有（进程重启后）再从数据库补
 *
 * 运行要求：Node.js >= 22.5（node:sqlite）
 */

import { closeDb, getDb } from './db'

// 数据目录 / 数据库路径由 db 模块统一管理

/** 任务种类 */
export type TaskKind = 'stock' | 'price' | 'tab'

/** 任务状态 */
export type TaskStatus = 'running' | 'stopped' | 'completed'

/** 落库任务的基础字段 */
export interface StoredTaskBase {
  id: string
  userId: string
  userEmail: string
  status: TaskStatus
  createdAt: Date
}

/** 数据库行 */
interface TaskRow {
  kind: string
  id: string
  user_id: string
  user_email: string
  status: string
  created_at: number
  updated_at: number
  payload: string
}

/** 进度类写入的最小间隔（毫秒） */
const PERSIST_THROTTLE_MS = 1000

/** 节流定时器：key 为 `${kind}:${id}` */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** 节流待写入任务：key -> { kind, task } */
const pendingTasks = new Map<string, { kind: TaskKind; task: StoredTaskBase }>()

/**
 * 序列化任务（去掉不可序列化的 controller，Date 转 ISO）
 */
const serialize = (task: StoredTaskBase): string => {
  const plain: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(task)) {
    if (key === 'controller') {
      continue
    }
    plain[key] = value instanceof Date ? value.toISOString() : value
  }
  return JSON.stringify(plain)
}

/**
 * 反序列化任务（恢复 Date 字段）
 */
const deserialize = <T extends StoredTaskBase>(row: TaskRow): T => {
  const payload = JSON.parse(row.payload) as Record<string, unknown>

  const restored: Record<string, unknown> = {
    ...payload,
    id: row.id,
    status: row.status,
    userId: row.user_id,
    userEmail: row.user_email,
    createdAt: new Date(row.created_at),
  }

  if (typeof payload.lastDetectedAt === 'string') {
    restored.lastDetectedAt = new Date(payload.lastDetectedAt)
  }

  return restored as unknown as T
}

/**
 * 立即写入（同步）
 */
export const persistTask = <T extends StoredTaskBase>(kind: TaskKind, task: T): void => {
  const connection = getDb()
  if (!connection) {
    return
  }

  const key = `${kind}:${task.id}`
  const timer = pendingTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    pendingTimers.delete(key)
  }
  pendingTasks.delete(key)

  try {
    connection
      .prepare(`
        INSERT INTO tasks (kind, id, user_id, user_email, status, created_at, updated_at, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET
          user_id = excluded.user_id,
          user_email = excluded.user_email,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `)
      .run(
        kind,
        task.id,
        task.userId,
        task.userEmail,
        task.status,
        new Date(task.createdAt).getTime(),
        Date.now(),
        serialize(task)
      )
  } catch (error) {
    console.error(`[TaskStore] 写入任务 ${key} 失败:`, error)
  }
}

/**
 * 节流写入（进度更新用，同一任务 1 秒内只落盘一次）
 */
export const persistTaskSoon = <T extends StoredTaskBase>(kind: TaskKind, task: T): void => {
  const key = `${kind}:${task.id}`
  pendingTasks.set(key, { kind, task })

  if (pendingTimers.has(key)) {
    return
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(key)
    const pending = pendingTasks.get(key)
    pendingTasks.delete(key)
    if (pending) {
      persistTask(pending.kind, pending.task)
    }
  }, PERSIST_THROTTLE_MS)

  // 待写入的定时器不应阻止进程退出
  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  pendingTimers.set(key, timer)
}

/**
 * 删除任务
 */
export const deleteTask = (kind: TaskKind, taskId: string): void => {
  const key = `${kind}:${taskId}`
  const timer = pendingTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    pendingTimers.delete(key)
  }
  pendingTasks.delete(key)

  const connection = getDb()
  if (!connection) {
    return
  }

  try {
    connection.prepare('DELETE FROM tasks WHERE kind = ? AND id = ?').run(kind, taskId)
  } catch (error) {
    console.error(`[TaskStore] 删除任务 ${key} 失败:`, error)
  }
}

/**
 * 按用户查询任务（created_at 倒序）
 */
export const listTasks = <T extends StoredTaskBase>(kind: TaskKind, userId?: string): T[] => {
  const connection = getDb()
  if (!connection) {
    return []
  }

  try {
    const statement = userId
      ? connection.prepare('SELECT * FROM tasks WHERE kind = ? AND user_id = ? ORDER BY created_at DESC')
      : connection.prepare('SELECT * FROM tasks WHERE kind = ? ORDER BY created_at DESC')

    const rows = (userId ? statement.all(kind, userId) : statement.all(kind)) as TaskRow[]
    return rows.map(row => deserialize<T>(row))
  } catch (error) {
    console.error(`[TaskStore] 查询任务列表失败 (${kind}):`, error)
    return []
  }
}

/**
 * 查询单个任务
 */
export const getTask = <T extends StoredTaskBase>(kind: TaskKind, taskId: string): T | null => {
  const connection = getDb()
  if (!connection) {
    return null
  }

  try {
    const row = connection
      .prepare('SELECT * FROM tasks WHERE kind = ? AND id = ?')
      .get(kind, taskId) as TaskRow | undefined

    return row ? deserialize<T>(row) : null
  } catch (error) {
    console.error(`[TaskStore] 查询任务 ${taskId} 失败:`, error)
    return null
  }
}

/**
 * 查询重启前仍在运行的任务（用于开机续跑）
 */
export const listRunningTasks = <T extends StoredTaskBase>(kind: TaskKind): T[] => {
  const connection = getDb()
  if (!connection) {
    return []
  }

  try {
    const rows = connection
      .prepare("SELECT * FROM tasks WHERE kind = ? AND status = 'running' ORDER BY created_at ASC")
      .all(kind) as TaskRow[]

    return rows.map(row => deserialize<T>(row))
  } catch (error) {
    console.error(`[TaskStore] 查询运行中任务失败 (${kind}):`, error)
    return []
  }
}

/**
 * 把待写入的节流任务全部落盘（进程退出前调用）
 */
export const flushPendingTasks = (): void => {
  const entries = Array.from(pendingTasks.values())

  for (const timer of pendingTimers.values()) {
    clearTimeout(timer)
  }
  pendingTimers.clear()
  pendingTasks.clear()

  for (const { kind, task } of entries) {
    persistTask(kind, task)
  }
}

/**
 * 落盘待写入任务并关闭数据库连接
 */
export const closeTaskStore = (): void => {
  flushPendingTasks()
  closeDb()
}
