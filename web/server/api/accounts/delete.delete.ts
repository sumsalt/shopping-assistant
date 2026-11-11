/**
 * 删除账号
 * DELETE /api/accounts/delete?id=xxx
 */

import { getQuery } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { deleteAccount, getAccount } from '../../utils/accountStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const query = getQuery(event)
    const id = typeof query.id === 'string' ? query.id : ''
    if (!id) {
      return createErrorResponse('INVALID_PARAMS', '缺少账号 ID')
    }

    const existing = getAccount(id)
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '账号不存在')
    }
    if (existing.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权删除此账号')
    }

    const removed = deleteAccount(id)
    if (!removed) {
      return createErrorResponse('UNKNOWN_ERROR', '删除失败，请稍后重试')
    }

    return createSuccessResponse({ id })
  } catch (error) {
    console.error('[Accounts] 删除账号失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '删除账号失败')
  }
})
