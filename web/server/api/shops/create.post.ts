/**
 * 新增店铺评分
 * POST /api/shops/create
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { createShop } from '../../utils/shopStore'
import { parseShopInput } from '../../utils/shopValidate'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const parsed = parseShopInput(body)
    if (!parsed.ok) {
      return createErrorResponse('INVALID_PARAMS', parsed.error)
    }

    const shop = createShop(currentUser.username, parsed.value)
    if (!shop) {
      return createErrorResponse('UNKNOWN_ERROR', '保存失败，请稍后重试')
    }

    return createSuccessResponse({
      shop: {
        ...shop,
        createdAt: shop.createdAt.toISOString(),
        updatedAt: shop.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Shops] 新增店铺失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '新增店铺失败')
  }
})
