/**
 * 任务层契约
 *
 * 每种监控（到货 / Tab / 价格）只实现这一个接口，路由与恢复流程全部复用：
 *   - 路由文件不再持有 Map、不再实现生命周期，只做 HTTP 编解码
 *   - 新增一种监控 = 新增一个 definition + 5 个 3 行路由
 */

import type { StoredTaskBase, TaskKind } from '../utils/taskStore'

/**
 * 任务记录：落盘字段 + 运行时 controller
 *
 * controller 只存在于内存，序列化时会被 taskStore 跳过。
 */
export interface TaskRecord extends StoredTaskBase {
  controller?: AbortController
}

/** 当前登录用户 */
export interface TaskUser {
  username: string
  email: string
}

/** 续跑 / 重启时可覆盖的启动参数 */
export interface StartOverrides {
  /** 续跑：保留重启前的统计与已见集合 */
  resume?: boolean
  /** 剩余时长（秒），续跑时按「创建时间 + 时长」重新计算 */
  duration?: number
  initialCheckCount?: number
  initialErrorCount?: number
  initialDetectedCount?: number
}

/** 列表视图的共享上下文（例如一次查询内复用黑名单） */
export type ListContext = Record<string, unknown>

export interface TaskDefinition<R extends TaskRecord> {
  kind: TaskKind
  /** 日志与提示用的中文名 */
  label: string

  /** 校验请求体并构造记录内容（不含 id / 所属用户 / 状态 / 创建时间） */
  create(input: { body: any; user: TaskUser }): Promise<Partial<R>> | Partial<R>

  /** 启动或续跑；实现里负责把 config.taskId 设成 record.id */
  start(record: R, overrides?: StartOverrides): void

  /** 重新发起：以原任务为模板生成新记录内容 */
  restart(original: R): Promise<Partial<R>> | Partial<R>

  /** 重启时是否先删掉原任务（价格监控会，避免两个循环同时通知） */
  removeOriginalOnRestart?: boolean

  /** 列表视图（每个任务一行） */
  listView(record: R, ctx: ListContext): unknown

  /** 详情视图 */
  statusView(record: R): unknown

  /** 创建 / 重启成功响应 */
  createdView(record: R, action: 'created' | 'restarted'): Record<string, unknown>

  /** 列表查询前准备一次共享上下文（可选） */
  prepareList?(userId: string): Promise<ListContext> | ListContext

  /**
   * 进程启动时恢复任务
   *
   * @param remainingSeconds 剩余时长，Infinity 表示不限时
   * @returns 是否成功续跑
   */
  restore?(record: R, remainingSeconds: number): boolean
}

/**
 * 业务错误
 *
 * 定义层不直接拼 HTTP 响应，抛出它由路由层统一转成 `createErrorResponse`，
 * 保证所有接口的响应结构一致。
 */
export class TaskApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'TaskApiError'
  }
}
