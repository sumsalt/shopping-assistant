/**
 * 任务注册表
 *
 * 内存 Map 是运行时副本（需要持有 AbortController），SQLite 是落盘副本。
 * 这里把「内存 + 落盘 + 状态流转 + 进度节流」收敛成一份实现，
 * 三类任务不再各写一遍。
 */

import {
  deleteTask,
  getTask,
  listTasks,
  persistTask,
  persistTaskSoon,
  type TaskKind,
} from '../utils/taskStore'
import type { TaskDefinition, StartOverrides, TaskRecord } from './types'

/** 生成任务 ID（前缀区分种类，便于日志排查） */
export const generateTaskId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

export class TaskRegistry<R extends TaskRecord> {
  /** 运行时任务表（外部只读，不要在别处直接改写） */
  private readonly tasks = new Map<string, R>()

  /**
   * 已删除的任务 id
   *
   * 中止任务后 promise 收尾时还会落盘一次，如果不管就会把刚删掉的记录写回来
   * （表现为「删除后列表里还剩一条已完成的同名任务」）。
   */
  private readonly removed = new Set<string>()

  constructor(private readonly kind: TaskKind) {}

  /** 内存优先，重启后从数据库补 */
  get(taskId: string): R | null {
    return this.tasks.get(taskId) ?? getTask<R>(this.kind, taskId)
  }

  /** 只查内存（需要 controller 时用） */
  getLive(taskId: string): R | undefined {
    return this.tasks.get(taskId)
  }

  /** 新增并立即落盘 */
  add(record: R): void {
    this.removed.delete(record.id)
    this.tasks.set(record.id, record)
    persistTask(this.kind, record)
  }

  /** 移除并删除落盘副本 */
  remove(taskId: string): void {
    this.removed.add(taskId)
    this.tasks.delete(taskId)
    deleteTask(this.kind, taskId)
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

  /** 当前内存中的全部任务（内部推理 / 查重用） */
  all(): R[] {
    return Array.from(this.tasks.values())
  }

  /**
   * 某用户的任务：内存里的最新进度优先，数据库里仅存的部分补在后面
   */
  listFor(userId: string): R[] {
    const live = this.all().filter(task => task.userId === userId)
    const liveIds = new Set(live.map(task => task.id))
    const stored = listTasks<R>(this.kind, userId).filter(task => !liveIds.has(task.id))

    return [...live, ...stored].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  /** 进度节流落盘（一轮检测内高频调用） */
  touch(record: R): void {
    if (this.removed.has(record.id)) return
    persistTaskSoon(this.kind, record)
  }

  /**
   * 挂载后台任务
   *
   * 统一处理：controller 回写、promise 结束后的状态流转与落盘。
   * `starter` 只负责调用 core 的监控函数并把 controller/promise 返回。
   */
  launch(
    record: R,
    starter: () => { controller: AbortController; promise: Promise<unknown> },
    onError?: (error: unknown) => void
  ): void {
    const { controller, promise } = starter()
    record.controller = controller

    promise
      .then(() => {
        // 任务已被删除：不再写回，否则会把记录复活
        if (this.removed.delete(record.id)) return
        record.status = 'completed'
        record.controller = undefined
        persistTask(this.kind, record)
      })
      .catch(error => {
        if (this.removed.delete(record.id)) return
        console.error(`[${this.kind}] 任务 ${record.id} 失败:`, error)
        record.status = 'stopped'
        record.controller = undefined
        onError?.(error)
        persistTask(this.kind, record)
      })
  }
}

/**
 * 通用「创建任务」流程
 *
 * 调用方：路由层，以及恢复流程里需要重启任务的场景。
 */
export const createTaskFromDefinition = async <R extends TaskRecord>(
  definition: TaskDefinition<R>,
  registry: TaskRegistry<R>,
  input: { body: any; user: { username: string; email: string } }
): Promise<R> => {
  const partial = await definition.create(input)

  const record = {
    ...partial,
    id: generateTaskId(definition.kind),
    userId: input.user.username,
    userEmail: input.user.email,
    status: 'running',
    createdAt: new Date(),
  } as R

  registry.add(record)
  definition.start(record)
  return record
}

/** 通用「重新发起」流程 */
export const restartTaskFromDefinition = async <R extends TaskRecord>(
  definition: TaskDefinition<R>,
  registry: TaskRegistry<R>,
  original: R
): Promise<R> => {
  const partial = await definition.restart(original)

  if (definition.removeOriginalOnRestart) {
    registry.abort(original.id)
    registry.remove(original.id)
  }

  const record = {
    ...partial,
    id: generateTaskId(definition.kind),
    userId: original.userId,
    userEmail: original.userEmail,
    status: 'running',
    createdAt: new Date(),
  } as R

  registry.add(record)
  definition.start(record)
  return record
}

export type { StartOverrides }
