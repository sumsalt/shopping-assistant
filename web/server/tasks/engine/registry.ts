/**
 * 任务运行时注册表
 *
 * 内存 Map 是运行态副本（持有 AbortController），SQLite 是落盘副本。
 * 这里只负责「内存 + 状态流转 + 进度节流」，不碰 SQL（交给 store）。
 */

import type { TaskKind } from '@core/contract'
import { getTask, listTasks, removeTask, saveTask, saveTaskSoon, type StoredTaskRow } from './store'
import type { TaskRecordBase } from './types'

/** 任务 ID：前缀区分种类，便于日志排查 */
export const generateTaskId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

const toStored = <S>(record: TaskRecordBase<S>): StoredTaskRow<S> => ({
  kind: record.kind,
  id: record.id,
  userId: record.userId,
  userEmail: record.userEmail,
  status: record.status,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  version: record.version,
  state: record.state,
  ...(record.accountId ? { accountId: record.accountId } : {}),
  secret: record.secret ?? null,
})

const toRecord = <S>(row: StoredTaskRow<S>): TaskRecordBase<S> => ({
  id: row.id,
  kind: row.kind,
  userId: row.userId,
  userEmail: row.userEmail,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  version: row.version,
  state: row.state,
  ...(row.accountId ? { accountId: row.accountId } : {}),
  ...(row.secret ? { secret: row.secret } : {}),
})

export class TaskRegistry<S = unknown> {
  private readonly tasks = new Map<string, TaskRecordBase<S>>()

  /**
   * 已删除的任务 id
   *
   * 中止后 promise 收尾时还会落盘一次，如果不挡住就会把刚删掉的记录写回来。
   */
  private readonly removed = new Set<string>()

  constructor(private readonly kind: TaskKind) {}

  /** 内存优先，重启后从数据库补 */
  get(taskId: string): TaskRecordBase<S> | null {
    const live = this.tasks.get(taskId)
    if (live) return live
    const row = getTask<S>(this.kind, taskId)
    return row ? toRecord(row) : null
  }

  /** 只查内存（需要 controller 时用） */
  getLive(taskId: string): TaskRecordBase<S> | undefined {
    return this.tasks.get(taskId)
  }

  /** 新增并立即落盘 */
  add(record: TaskRecordBase<S>): void {
    this.removed.delete(record.id)
    record.updatedAt = new Date()
    this.tasks.set(record.id, record)
    saveTask(toStored(record))
  }

  /** 移除并删除落盘副本 */
  remove(taskId: string): void {
    this.removed.add(taskId)
    this.tasks.delete(taskId)
    removeTask(this.kind, taskId)
  }

  /** 中止运行中的任务（不删记录） */
  abort(taskId: string): void {
    const record = this.tasks.get(taskId)
    if (!record?.controller) return
    try {
      record.controller.abort()
    } catch (error) {
      console.error(`[${this.kind}] 中止任务 ${taskId} 失败:`, error)
    }
  }

  /** 内存中的全部任务（查重用） */
  all(): TaskRecordBase<S>[] {
    return Array.from(this.tasks.values())
  }

  /** 某用户的任务：内存最新进度优先，数据库里未加载的补在后面 */
  listFor(userId: string): TaskRecordBase<S>[] {
    const live = this.all().filter(task => task.userId === userId)
    const liveIds = new Set(live.map(task => task.id))
    const stored = listTasks<S>(this.kind, userId)
      .filter(row => !liveIds.has(row.id))
      .map(toRecord)

    return [...live, ...stored].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )
  }

  /** 进度节流落盘 */
  touch(record: TaskRecordBase<S>, mode: 'now' | 'soon' = 'soon'): void {
    if (this.removed.has(record.id)) return
    record.updatedAt = new Date()
    if (mode === 'now') saveTask(toStored(record))
    else saveTaskSoon(toStored(record))
  }

  /**
   * 挂载后台任务
   *
   * 统一处理 controller 回写、promise 收尾后的状态与落盘。
   */
  launch(
    record: TaskRecordBase<S>,
    starter: () => { controller: AbortController; promise: Promise<unknown> },
    onError?: (error: unknown) => void
  ): void {
    const { controller, promise } = starter()
    record.controller = controller

    promise
      .then(() => {
        // 已被更新的一次 launch 取代（如延长任务时在同 record 上重启）：旧循环收尾不得覆盖新状态
        if (record.controller !== controller) return
        if (this.removed.delete(record.id)) return
        record.status = 'completed'
        record.controller = undefined
        record.updatedAt = new Date()
        saveTask(toStored(record))
      })
      .catch(error => {
        if (record.controller !== controller) return
        if (this.removed.delete(record.id)) return
        console.error(`[${this.kind}] 任务 ${record.id} 失败:`, error)
        record.status = 'stopped'
        record.controller = undefined
        record.updatedAt = new Date()
        onError?.(error)
        saveTask(toStored(record))
      })
  }
}
