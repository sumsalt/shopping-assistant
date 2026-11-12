/**
 * 创建订单续期任务（专用路由）
 *
 * 与通用 createTaskHandler 的差别：用户要「选账号」，而通用逻辑固定取当前激活账号。
 * 账号归属校验与 adapterConfig 解析都在 createRenewTaskForAccount 内做，
 * 前端只传 accountId + duration，不回传任何登录态。
 */
import { defineEventHandler, readBody } from 'h3'
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { createRenewTaskForAccount } from '../../tasks/auto-renew'
import { renewDefinition } from '../../tasks/renew'
import { TaskApiError } from '../../tasks/types'

export default defineEventHandler(async (event) => {
  try {
    const user = getCurrentUser(event)
    if (!user) return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')

    const body = await readBody(event)
    const record = await createRenewTaskForAccount({
      username: user.username,
      email: user.email,
      accountId: String(body?.accountId ?? '').trim(),
      duration: body?.config?.duration === undefined ? undefined : Number(body.config.duration),
      source: 'manual',
    })

    return createSuccessResponse(renewDefinition.createdView(record, 'created'))
  } catch (error) {
    if (error instanceof TaskApiError) {
      return createErrorResponse(error.code, error.message)
    }
    console.error('创建订单续期任务失败:', error)
    return createErrorResponse(
      ErrorCode.UNKNOWN_ERROR,
      error instanceof Error ? error.message : '未知错误'
    )
  }
})
