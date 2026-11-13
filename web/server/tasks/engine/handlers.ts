/**
 * 通用任务 HTTP 处理器
 *
 * 5 个动作 × N 类任务共用这一份实现：
 *   - 鉴权、所有权、错误映射
 *   - 请求/响应编解码
 * 路由文件退化成一行声明。
 */

import { defineEventHandler, getQuery, readBody, type H3Event } from 'h3'
import type { TaskCreatedPayload, TaskDetailPayload, TaskListPayload } from '@core/contract'
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import type { TaskService } from './service'
import { TaskApiError } from './types'

type Handler = (event: H3Event) => Promise<unknown>

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

const requireUser = (event: H3Event) => getCurrentUser(event)

export const createTaskHandler = <S>(service: TaskService<S>) =>
  safeHandler(`创建${service.definition.label}任务`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const body = await readBody(event)
    const record = await service.create({ body, user })
    const payload: TaskCreatedPayload = {
      taskId: record.id,
      task: service.definition.project(record, { full: true }),
      message: `${service.definition.label}任务已启动`,
    }
    return createSuccessResponse(payload)
  })

export const listTaskHandler = <S>(service: TaskService<S>) =>
  safeHandler(`查询${service.definition.label}任务列表`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const tasks = service.list(user.username)
    const payload: TaskListPayload = { tasks, total: tasks.length }
    return createSuccessResponse(payload)
  })

export const statusTaskHandler = <S>(service: TaskService<S>) =>
  safeHandler(`查询${service.definition.label}任务状态`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const taskId = getQuery(event).taskId as string
    if (!taskId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少任务 ID')

    const payload: TaskDetailPayload = { task: service.status(user.username, taskId) }
    return createSuccessResponse(payload)
  })

export const deleteTaskHandler = <S>(service: TaskService<S>) =>
  safeHandler(`删除${service.definition.label}任务`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const taskId = getQuery(event).taskId as string
    if (!taskId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少任务 ID')

    service.remove(user.username, taskId)
    return createSuccessResponse({ message: '任务已删除', taskId })
  })

export const restartTaskHandler = <S>(service: TaskService<S>) =>
  safeHandler(`重新发起${service.definition.label}任务`, async event => {
    const user = requireUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const body = await readBody(event)
    const taskId = body?.taskId as string
    if (!taskId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少任务 ID')

    const record = await service.restart(user.username, taskId)
    const payload: TaskCreatedPayload = {
      taskId: record.id,
      task: service.definition.project(record, { full: true }),
      message: `${service.definition.label}任务已重新发起`,
    }
    return createSuccessResponse(payload)
  })
