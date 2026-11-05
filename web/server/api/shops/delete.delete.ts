/**
 * 删除店铺评分
 * DELETE /api/shops/delete
 */

import { getQuery } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { deleteShop, getShop } from '../../utils/shopStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const query = getQuery(event)
    const id = typeof query.id === 'string' ? query.id : ''
    if (!id) {
      return createErrorResponse('INVALID_PARAMS', '缺少店铺 ID')
    }

    const existing = getShop(id)
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '店铺不存在')
    }
    if (existing.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权删除此店铺')
    }

    const removed = deleteShop(id)
    if (!removed) {
      return createErrorResponse('UNKNOWN_ERROR', '删除失败，请稍后重试')
    }

    return createSuccessResponse({ id })
  } catch (error) {
    console.error('[Shops] 删除店铺失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '删除店铺失败')
  }
})
