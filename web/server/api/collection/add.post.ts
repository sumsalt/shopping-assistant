/**
 * 添加到一手收藏夹
 * POST /api/collection/add
 *
 * 只对「当前账号」操作，不接受前端指定账号，避免误用他人凭据。
 * 重复收藏时一手返回业务错误「该商品已收藏」，这里翻译成 DUPLICATE，
 * 前端据此提示「已收藏」而不是报错。
 */

import { addProductToCollection } from '@core'
import type { StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'

interface AddCollectionBody {
  productNo?: string
}

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
    }

    const body = await readBody<AddCollectionBody>(event)
    const productNo = typeof body?.productNo === 'string' ? body.productNo.trim() : ''
    if (!productNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '缺少商品货号，无法收藏')
    }

    const { config, hasCredential } = resolveAdapterConfigForUser(currentUser.username)
    if (!hasCredential) {
      return createErrorResponse(ErrorCode.AUTH_REQUIRED, '当前账号没有登录态，请先在账号管理选择账号')
    }

    const result = await addProductToCollection(
      { platform: 'yishou', productNo },
      { adapterConfig: config }
    )

    return createSuccessResponse(result)
  } catch (error: unknown) {
    // 已收藏是预期内的业务结果，不当成异常打日志
    const message = error instanceof Error ? error.message : ''
    if (message.includes('已收藏')) {
      return createErrorResponse(ErrorCode.DUPLICATE, '该商品已在一手收藏夹里')
    }

    console.error('添加到收藏夹失败:', error)

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
