/**
 * 从一手收藏夹移除商品
 * POST /api/collection/remove
 *
 * 只对「当前账号」操作，不接受前端指定账号，避免误用他人凭据。
 * 一手 del 接口按 goods_no + collect_id 定位收藏条目，两者缺一不可；
 * goods_id 抓包里也带了，有就一并传，尽量与真机一致。
 */

import { removeProductFromCollection } from '@core'
import type { StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'

interface RemoveCollectionBody {
  productNo?: string
  productId?: string
  collectId?: string
}

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
    }

    const body = await readBody<RemoveCollectionBody>(event)
    const productNo = typeof body?.productNo === 'string' ? body.productNo.trim() : ''
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
    const collectId = typeof body?.collectId === 'string' ? body.collectId.trim() : ''
    if (!productNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '缺少商品货号，无法取消收藏')
    }
    if (!collectId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '缺少收藏 ID，无法取消收藏')
    }

    const { config, hasCredential } = resolveAdapterConfigForUser(currentUser.username, true)
    if (!hasCredential) {
      return createErrorResponse(ErrorCode.AUTH_REQUIRED, '当前账号没有登录态，请先在账号管理选择账号')
    }

    await removeProductFromCollection(
      { platform: 'yishou', productNo, productId: productId || undefined, collectId },
      { adapterConfig: config }
    )

    return createSuccessResponse({ ok: true })
  } catch (error: unknown) {
    console.error('取消收藏失败:', error)

    if (error && typeof error === 'object' && 'type' in error) {
      const stockError = error as StockCheckError
      return createErrorResponse(stockError.type, stockError.message)
    }

    return createErrorResponse(
      ErrorCode.UNKNOWN_ERROR,
      error instanceof Error ? error.message : '未知错误'
    )
  }
})
