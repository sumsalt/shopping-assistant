/**
 * 任务编排服务
 *
 * 唯一同时接触 registry（运行态）与 store（落盘）的地方。
 * 路由、definition、前端都不得绕过它直接操作任务。
 */

import { activeSecondsBetween } from '@core/utils/active-window'
import type { TaskSummary } from '@core/contract'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'
import { ErrorCode } from '../../utils/response'
import { generateTaskId, TaskRegistry } from './registry'
import { listRunningTasks } from './store'
import {
  TaskApiError,
  type TaskKindDefinition,
  type TaskProjectOptions,
  type TaskRecordBase,
  type TaskRunContext,
} from './types'

export interface TaskCreateRequest {
  body: any
  user: { username: string; email: string }
}

/** 计算已运行秒数：配了生效时段时，休眠时间不消耗时长 */
const elapsedSeconds = (record: TaskRecordBase, window?: { start: string; end: string }): number => {
  const now = new Date()
  return window
    ? activeSecondsBetween(record.createdAt, now, window)
    : (now.getTime() - record.createdAt.getTime()) / 1000
}

export class TaskService<S> {
  constructor(
    public readonly definition: TaskKindDefinition<S>,
    public readonly registry: TaskRegistry<S>
  ) {}

  /** 创建任务 */
  async create({ body, user }: TaskCreateRequest): Promise<TaskRecordBase<S>> {
    const needAuth = this.definition.requiresAuth(body)

    // 默认用当前激活账号；需要显式选账号的任务（续期）由定义自己解析
    const resolved = this.definition.resolveAccount
      ? (() => {
          const custom = this.definition.resolveAccount!({ body, user })
          return { config: custom.secret, accountId: custom.accountId, hasCredential: custom.hasCredential }
        })()
      : (() => {
          const base = resolveAdapterConfigForUser(user.username, needAuth)
          return { config: base.config, accountId: base.account?.id ?? '', hasCredential: base.hasCredential }
        })()

    if (needAuth && !resolved.hasCredential) {
      throw new TaskApiError(
        ErrorCode.AUTH_REQUIRED,
        '当前账号没有登录态（uid/token 不完整），请先在账号管理选择有效账号'
      )
    }

    const accountId = resolved.accountId
    const { state } = await this.definition.create({
      body: body && typeof body === 'object' ? body : {},
      user,
      accountId,
      secret: resolved.config,
    })

    const record: TaskRecordBase<S> = {
      id: generateTaskId(this.definition.kind),
      kind: this.definition.kind,
      userId: user.username,
      userEmail: user.email,
      status: 'running',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: this.definition.version,
      state,
      ...(accountId ? { accountId } : {}),
      secret: resolved.config,
    }

    this.definition.uniqueness?.(record, this.registry.all())

    this.registry.add(record)
    this.start(record)
    return record
  }

  /** 启动（新任务 / 续跑共用） */
  start(record: TaskRecordBase<S>, options: { resume?: boolean; durationSeconds?: number } = {}): void {
    const ctx: TaskRunContext = {
      save: (mode = 'soon') => this.registry.touch(record, mode),
      resume: Boolean(options.resume),
      ...(options.durationSeconds !== undefined ? { durationSeconds: options.durationSeconds } : {}),
      log: (message, level = 'info') => {
        const line = `[${this.definition.label}] ${record.id} ${message}`
        if (level === 'error') console.error(line)
        else if (level === 'warn') console.warn(line)
        else console.log(line)
      },
    }

    this.registry.launch(
      record,
      () => this.definition.run(record, ctx),
      error => {
        this.applyError(record, error)
      }
    )
  }

  /** 列表：只返回当前 schema 版本的任务，避免未迁移数据把页面打崩 */
  list(userId: string, options: TaskProjectOptions = {}): TaskSummary[] {
    return this.registry
      .listFor(userId)
      .filter(record => record.version >= this.definition.version)
      .map(record => this.definition.project(record, options))
  }

  /** 详情 */
  status(username: string, taskId: string): TaskSummary {
    const record = this.requireOwned(username, taskId, '查询')
    return this.definition.project(record, { full: true })
  }

  /** 删除 */
  remove(username: string, taskId: string): void {
    this.requireOwned(username, taskId, '删除')
    this.registry.abort(taskId)
    this.registry.remove(taskId)
  }

  /** 重新发起 */
  async restart(username: string, taskId: string): Promise<TaskRecordBase<S>> {    const original = this.requireOwned(username, taskId, '操作')
    const { state } = this.definition.restart(original)

    if (this.definition.removeOriginalOnRestart) {
      this.registry.abort(original.id)
      this.registry.remove(original.id)
    }

    const record: TaskRecordBase<S> = {
      id: generateTaskId(this.definition.kind),
      kind: this.definition.kind,
      userId: original.userId,
      userEmail: original.userEmail,
      status: 'running',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: this.definition.version,
      state,
      ...(original.accountId ? { accountId: original.accountId } : {}),
      ...(original.secret ? { secret: original.secret } : {}),
    }

    this.definition.uniqueness?.(record, this.registry.all())
    this.registry.add(record)
    this.start(record)
    return record
  }

  /**
   * 延长运行中的任务：把时长重置为 durationSeconds（从当前时刻重新计时），保留累计统计。
   *
   * 用于「已有同类任务时把时长更新为 12 小时」：不新建任务、不换 id，
   * 只重置计时起点并在原 record 上以新时长重启监控循环。
   */
  extend(username: string, taskId: string, durationSeconds: number): TaskRecordBase<S> {
    const record = this.requireOwned(username, taskId, '更新')
    if (record.status !== 'running') {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '任务未在运行，无法更新时长')
    }

    const state = record.state as unknown as { config?: { duration?: number } }
    if (!state || typeof state !== 'object' || !state.config) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '该任务不支持修改时长')
    }

    // 更新配置时长（UI 与持久化都读这里）
    state.config.duration = durationSeconds
    // 重置计时起点：保证进程重启后 remaining 仍按新时长计算
    record.createdAt = new Date()
    record.status = 'running'

    // 中止旧循环，在同一 record 上按新时长重启（run 以现有 state 为基数，累计不清零）
    this.registry.abort(record.id)
    record.controller = undefined
    // 确保在内存表内并落盘（get 可能返回仅来自 DB 的副本）
    this.registry.add(record)
    this.start(record, { resume: true, durationSeconds })
    return record
  }

  /** 进程启动时恢复该 kind 的任务；返回成功续跑数 */
  restoreAll(): number {
    let resumed = 0

    for (const row of listRunningTasks<S>(this.definition.kind)) {
      const record: TaskRecordBase<S> = {
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
      }

      try {
        if (record.version < this.definition.version) {
          console.warn(
            `[Restore] ${this.definition.label} ${record.id} 版本 ${record.version} < ${this.definition.version}，跳过`
          )
          record.status = 'stopped'
          this.registry.add(record)
          continue
        }

        const duration = this.definition.durationOf(record)
        const remaining = Number.isFinite(duration)
          ? Math.max(0, Number(duration) - elapsedSeconds(record, this.definition.activeWindowOf?.(record)))
          : Number.POSITIVE_INFINITY

        if (remaining <= 0) {
          record.status = 'completed'
          this.registry.add(record)
          continue
        }

        const others = this.registry.listFor(record.userId).filter(item => item.id !== record.id)
        if (this.definition.canRestore && !this.definition.canRestore(record, others)) {
          record.status = 'stopped'
          this.registry.add(record)
          continue
        }

        if (this.definition.restore && !this.definition.restore(record, remaining)) {
          if (record.status === 'running') record.status = 'stopped'
          this.registry.add(record)
          continue
        }

        record.status = 'running'
        record.controller = undefined
        this.registry.add(record)
        this.start(record, {
          resume: true,
          ...(Number.isFinite(remaining) ? { durationSeconds: Math.floor(Number(remaining)) } : {}),
        })
        resumed++
      } catch (error) {
        console.error(`[Restore] 恢复${this.definition.label} ${record.id} 失败:`, error)
        record.status = 'stopped'
        this.registry.add(record)
      }
    }

    return resumed
  }

  /** 取任务并校验所有权 */
  requireOwned(username: string, taskId: string, action: string): TaskRecordBase<S> {
    const record = this.registry.get(taskId)
    if (!record) throw new TaskApiError(ErrorCode.NOT_FOUND, '任务不存在')
    if (record.userId !== username) {
      throw new TaskApiError(ErrorCode.FORBIDDEN, `无权${action}此任务`)
    }
    return record
  }

  /** 循环抛错时把原因落到 state.lastError（各 kind 的 state 都有该可选字段） */
  private applyError(record: TaskRecordBase<S>, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    const state = record.state as { lastError?: string }
    if (state && typeof state === 'object') {
      state.lastError = message
      this.registry.touch(record, 'now')
    }
  }
}
