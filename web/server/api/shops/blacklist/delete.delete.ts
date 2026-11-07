/**
 * 移出店铺黑名单
 * DELETE /api/shops/blacklist/delete?id=xxx
 */

import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../../utils/response'
import { getCurrentUser } from '../../../utils/session'
import { removeFromBlacklist } from '../../../utils/shopBlacklistStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const query = getQuery(event)
    const id = String(query.id || '').trim()
    if (!id) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '记录 ID 不能为空')
    }

    const removed = removeFromBlacklist(currentUser.username, id)
    if (!removed) {
      return createErrorResponse('NOT_FOUND', '记录不存在')
    }

    return createSuccessResponse({ id })
  } catch (error) {
    console.error('[ShopBlacklist] 移出失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '移出黑名单失败')
  }
})
