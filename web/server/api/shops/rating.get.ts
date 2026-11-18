/**
 * 按供应商标识查询当前用户的店铺评分（详情页回显用）
 * GET /api/shops/rating?supplyId=xxx
 */

import { getQuery } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getShopBySupplyId } from '../../utils/shopStore'

export default defineEventHandler(async (event) => {
  const currentUser = getCurrentUser(event)
  if (!currentUser) {
    return createErrorResponse('UNAUTHORIZED', '请先登录')
  }

  const query = getQuery(event)
  const supplyId = typeof query.supplyId === 'string' ? query.supplyId.trim() : ''
  if (!supplyId) {
    return createErrorResponse('INVALID_PARAMS', '缺少供应商标识')
  }

  const shop = getShopBySupplyId(currentUser.username, supplyId)
  return createSuccessResponse({
    rating: shop?.rating ?? 0,
    shop: shop
      ? {
          ...shop,
          createdAt: shop.createdAt.toISOString(),
          updatedAt: shop.updatedAt.toISOString(),
        }
      : null,
  })
})
