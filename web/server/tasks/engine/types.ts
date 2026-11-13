/**
 * 任务引擎契约
 *
 * 每个任务种类只实现一个 TaskKindDefinition：
 *   create  —— 校验输入、建立基线，返回落盘状态
 *   run     —— 启动监控循环，返回 controller + promise
 *   project —— 把记录投影成统一 TaskSummary（纯函数）
 *   restart / restore / uniqueness —— 可选钩子
 *
 * 列表视图、详情视图、创建响应都由引擎统一生成，kind 不再各写一份。
 */

import type {
  AdapterConfig,
  TaskEvent,
  TaskKind,
  TaskStatus,
  TaskSummary,
} from '@core/contract'

/** 任务记录：内存态 = 落盘字段 + 运行时 controller */
export interface TaskRecordBase<S = unknown> {
  id: string
  kind: TaskKind
  userId: string
  userEmail: string
  status: TaskStatus
  createdAt: Date
  updatedAt: Date
  /** payload schema 版本，与 definition.version 对应 */
  version: number
  /** 业务状态（落 payload） */
  state: S
  /** 创建时固化的账号 ID（自动续期钩子用，可缺失） */
  accountId?: string
  /** 请求凭证（只进 secret 列，project 永远拿不到） */
  secret?: AdapterConfig
  /** 仅内存 */
  controller?: AbortController
}

/** 创建输入 */
export interface TaskCreateInput {
  body: any
  user: { username: string; email: string }
  /** 服务端解析出的账号 ID；没有账号时为空串 */
  accountId: string
  /** 服务端解析出的凭证；requiresAuth=false 时是匿名配置 */
  secret: AdapterConfig
}

/** 运行上下文 */
export interface TaskRunContext {
  /** 立即落盘 / 节流落盘 */
  save(mode?: 'now' | 'soon'): void
  /** 运行日志（统一带任务前缀） */
  log(message: string, level?: 'info' | 'warn' | 'error'): void
}

/** 运行结果：由 service 交给 registry.launch 统一收尾 */
export interface TaskRunner {
  controller: AbortController
  promise: Promise<unknown>
}

/** 投影选项 */
export interface TaskProjectOptions {
  /** 详情：返回全部事件；列表：只返回最近 5 条 */
  full?: boolean
}

/** 任务种类定义 */
export interface TaskKindDefinition<S> {
  kind: TaskKind
  label: string
  /** 当前 payload schema 版本 */
  version: number

  /** 创建时是否需要登录态（决定服务端解析完整快照还是匿名快照） */
  requiresAuth(body: unknown): boolean

  /** 校验输入 + 建立初始状态（可发一次基线请求） */
  create(input: TaskCreateInput): Promise<{ state: S }> | { state: S }

  /** 启动循环。实现里不得自己持有 Map / 落盘，只能通过 ctx.save */
  run(record: TaskRecordBase<S>, ctx: TaskRunContext): TaskRunner

  /** 唯一视图投影：列表与详情共用，纯函数 */
  project(record: TaskRecordBase<S>, options?: TaskProjectOptions): TaskSummary

  /** 重新发起：以原任务为模板生成新状态 */
  restart(record: TaskRecordBase<S>): { state: S }

  /** 任务时长（秒），用于重启后计算剩余时长；Infinity/undefined 表示不限时 */
  durationOf(record: TaskRecordBase<S>): number | undefined

  /** 创建前查重（抛 TaskApiError） */
  uniqueness?(record: TaskRecordBase<S>, all: TaskRecordBase<S>[]): void

  /** 重启时是否删除原任务 */
  removeOriginalOnRestart?: boolean

  /**
   * 重启后续跑前的校正：
   * 返回 false 表示不续跑（已到期 / 已下单 / 结果未知），由 service 标记结束。
   */
  restore?(record: TaskRecordBase<S>, remainingSeconds: number): boolean
}

/** 业务错误：由 HTTP 层统一转响应 */
export class TaskApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'TaskApiError'
  }
}

/** 事件构造小工具：保证 id/at 齐全，kind 实现不用重复写 */
export const makeEvent = (
  type: TaskEvent['type'],
  data: Omit<TaskEvent, 'id' | 'type' | 'at'> & { at?: number; id?: string }
): TaskEvent => {
  const at = data.at ?? Date.now()
  return {
    ...data,
    id: data.id ?? `evt_${type}_${at}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    at,
  }
}

/** 事件列表统一裁剪：新 → 旧，最多 50 条 */
export const capEvents = (events: TaskEvent[], limit = 50): TaskEvent[] =>
  events.slice(0, limit)
