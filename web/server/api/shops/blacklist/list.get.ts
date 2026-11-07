/**
 * 查询店铺黑名单
 * GET /api/shops/blacklist/list
 */

import { createSuccessResponse, createErrorResponse } from '../../../utils/response'
import { getCurrentUser } from '../../../utils/session'
import { listBlacklist } from '../../../utils/shopBlacklistStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const items = listBlacklist(currentUser.username)

    return createSuccessResponse({
      total: items.length,
      supplyIds: items.map(item => item.supplyId),
      items: items.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[ShopBlacklist] 查询失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '查询黑名单失败')
  }
})
