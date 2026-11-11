/**
 * 任务路由处理器（工厂）
 *
 * 5 个接口 × 3 类任务 = 15 个路由文件，但真正的差异只有「创建时校验什么」。
 * 这里把 HTTP 编解码、鉴权、所有权校验、错误映射统一掉，
 * 路由文件退化成一行声明。
 */

import { defineEventHandler, getQuery, readBody, type H3Event } from 'h3'
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../utils/response'
import { getCurrentUser } from '../utils/session'
import { resolveAdapterConfigForUser } from '../utils/adapterConfig'
import { createTaskFromDefinition, restartTaskFromDefinition, type TaskRegistry } from './registry'
import { TaskApiError, type TaskDefinition, type TaskRecord } from './types'

type Handler = (event: H3Event) => Promise<unknown>

/** 统一 try/catch：业务错误转对应 code，其余转 UNKNOWN_ERROR */
const safeHandler = (label: string, run: Handler) =>
  defineEventHandler(async (event: H3Event) => {
    try {
      return await run(event)
    } catch (error) {
      if (error instanceof TaskApiError) {
        return createErrorResponse(error.code, error.message)
      }
      console.error(`${label}失败:`, error)
      return createErrorResponse(
        ErrorCode.UNKNOWN_ERROR,
        error instanceof Error ? error.message : '未知错误'
      )
    }
  })

/** 取当前用户，未登录直接返回错误响应 */
const requireUser = (event: H3Event) => getCurrentUser(event)

/** 取任务并校验所有权 */
const requireOwnedTask = <R extends TaskRecord>(
  registry: TaskRegistry<R>,
  taskId: string,
  username: string,
  action: string
): R => {
  const task = registry.get(taskId)
  if (!task) throw new TaskApiError(ErrorCode.NOT_FOUND, '任务不存在')
  if (task.userId !== username) throw new TaskApiError(ErrorCode.FORBIDDEN, `无权${action}此任务`)
  return task
}

export const createTaskHandler = <R extends TaskRecord>(
  def: TaskDefinition<R>,
  registry: TaskRegistry<R>
) =>
  safeHandler(`创建${def.label}任务`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const body = await readBody(event)

    // 账号参数由服务端按当前账号解析后注入，不再信任请求体里的 adapterConfig。
    // 任务创建时把这份配置固化进 payload：之后切换账号不影响已创建的任务。
    const needAuth = def.needsAuth ? def.needsAuth(body) : false
    const resolved = resolveAdapterConfigForUser(user.username, needAuth)
    if (needAuth && !resolved.hasCredential) {
      throw new TaskApiError(
        ErrorCode.AUTH_REQUIRED,
        '当前账号没有登录态（uid/token 不完整），请先在账号管理选择有效账号'
      )
    }
    const payload = {
      ...(body && typeof body === 'object' && !Array.isArray(body) ? body : {}),
      config: {
        ...(body?.config && typeof body.config === 'object' ? body.config : {}),
        adapterConfig: resolved.config,
      },
    }

    const record = await createTaskFromDefinition(def, registry, { body: payload, user })

    return createSuccessResponse(def.createdView(record, 'created'))
  })

export const listTaskHandler = <R extends TaskRecord>(
  def: TaskDefinition<R>,
  registry: TaskRegistry<R>
) =>
  safeHandler(`查询${def.label}任务列表`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const ctx = def.prepareList ? await def.prepareList(user.username) : {}
    const tasks = registry.listFor(user.username).map(task => def.listView(task, ctx))

    return createSuccessResponse({ tasks, total: tasks.length })
  })

export const statusTaskHandler = <R extends TaskRecord>(
  def: TaskDefinition<R>,
  registry: TaskRegistry<R>
) =>
  safeHandler(`查询${def.label}任务状态`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const taskId = getQuery(event).taskId as string
    if (!taskId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少任务 ID')

    const task = requireOwnedTask(registry, taskId, user.username, '查询')
    return createSuccessResponse(def.statusView(task))
  })

export const deleteTaskHandler = <R extends TaskRecord>(
  def: TaskDefinition<R>,
  registry: TaskRegistry<R>
) =>
  safeHandler(`删除${def.label}任务`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const taskId = getQuery(event).taskId as string
    if (!taskId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少任务 ID')

    requireOwnedTask(registry, taskId, user.username, '删除')

    registry.abort(taskId)
    registry.remove(taskId)

    return createSuccessResponse({ message: '任务已删除', taskId })
  })

export const restartTaskHandler = <R extends TaskRecord>(
  def: TaskDefinition<R>,
  registry: TaskRegistry<R>
) =>
  safeHandler(`重新发起${def.label}任务`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const body = await readBody(event)
    const taskId = body?.taskId as string
    if (!taskId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少任务 ID')

    const original = requireOwnedTask(registry, taskId, user.username, '操作')

    // 注意：重启会在定义层做业务前置校验（如已下单成功不可重发）
    const record = await restartTaskFromDefinition(def, registry, original)
    return createSuccessResponse(def.createdView(record, 'restarted'))
  })
