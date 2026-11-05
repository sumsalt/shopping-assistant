/**
 * 查询当前用户的店铺评分列表
 * GET /api/shops/list
 */

import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listShops } from '../../utils/shopStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const shops = listShops(currentUser.username)

    // 星级分布：用于前端筛选条上的计数
    const ratingCounts: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let sum = 0
    for (const shop of shops) {
      ratingCounts[String(shop.rating)] = (ratingCounts[String(shop.rating)] ?? 0) + 1
      sum += shop.rating
    }

    return createSuccessResponse({
      shops: shops.map(shop => ({
        ...shop,
        createdAt: shop.createdAt.toISOString(),
        updatedAt: shop.updatedAt.toISOString(),
      })),
      total: shops.length,
      averageRating: shops.length ? Math.round((sum / shops.length) * 10) / 10 : 0,
      ratingCounts,
    })
  } catch (error) {
    console.error('[Shops] 查询店铺列表失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '查询店铺列表失败')
  }
})
