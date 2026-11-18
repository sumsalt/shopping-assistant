/**
 * 详情页店铺评分（按供应商标识幂等 upsert）
 * POST /api/shops/rate
 *
 * 从商品详情页的「店铺评分」弹窗调用：带上一手 provider 的 supplyId / 名称 / 市场 / 图标。
 * rating=1 即视为拉黑（该供应商商品不再抓取 / 展示），改成 2-5 星自动解除。
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { upsertShopRating } from '../../utils/shopStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const supplyId =
      body && typeof body.supplyId === 'string' ? body.supplyId.trim() : ''
    if (!supplyId) {
      return createErrorResponse('INVALID_PARAMS', '缺少供应商标识')
    }

    const ratingRaw = body && typeof body.rating === 'string' ? Number(body.rating) : body?.rating
    if (typeof ratingRaw !== 'number' || !Number.isFinite(ratingRaw)) {
      return createErrorResponse('INVALID_PARAMS', '请选择星级')
    }
    const rating = Math.round(ratingRaw)
    if (rating < 1 || rating > 5) {
      return createErrorResponse('INVALID_PARAMS', '星级需在 1-5 之间')
    }

    const str = (key: string, max: number): string =>
      body && typeof body[key] === 'string' ? body[key].trim().slice(0, max) : ''

    const shop = upsertShopRating(currentUser.username, {
      supplyId,
      name: str('name', 40),
      marketName: str('marketName', 100),
      image: str('image', 2000),
      rating,
      note: str('note', 2000),
    })
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
    console.error('[Shops] 店铺评分保存失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '评分保存失败')
  }
})
