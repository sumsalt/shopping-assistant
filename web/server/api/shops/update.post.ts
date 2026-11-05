/**
 * 更新店铺评分
 * POST /api/shops/update
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getShop, updateShop } from '../../utils/shopStore'
import { parseShopInput } from '../../utils/shopValidate'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const id = body && typeof body.id === 'string' ? body.id : ''
    if (!id) {
      return createErrorResponse('INVALID_PARAMS', '缺少店铺 ID')
    }

    const existing = getShop(id)
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '店铺不存在')
    }
    if (existing.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权修改此店铺')
    }

    const parsed = parseShopInput(body)
    if (!parsed.ok) {
      return createErrorResponse('INVALID_PARAMS', parsed.error)
    }

    const shop = updateShop(id, parsed.value)
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
    console.error('[Shops] 更新店铺失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '更新店铺失败')
  }
})
