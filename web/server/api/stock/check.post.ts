/**
 * 库存查询 API
 * POST /api/stock/check
 *
 * 只查询单个商品。按当前账号快照原样回放请求参数，
 * 不主动剔除 uid/token：账号带登录态时返回真实拿货价；账号没有登录态也能
 * 正常查询（一手把 shop_price 降级成 "??.??"，映射层回退 alone_price 并标注
 * 「游客参考价」），不在这里做凭证校验。
 */

import { checkStock } from '@core'
import type { StockCheckRequest, StockCheckResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'

// 请求体类型
interface CheckStockBody {
  productId?: string
  sku?: string
}

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
    }

    // 不主动去掉登录态：按当前账号快照完整回放（有凭证就带上，没有也能查）
    const { config: adapterConfig } = resolveAdapterConfigForUser(currentUser.username, true)

    const body = await readBody<CheckStockBody>(event)
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
    if (!productId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品 ID 不能为空；一次只能查询一个商品')
    }

    const request: StockCheckRequest = {
      platform: 'yishou',
      productId,
      ...(typeof body?.sku === 'string' && body.sku.trim() ? { sku: body.sku.trim() } : {}),
    }

    const result: StockCheckResult = await checkStock(request, { adapterConfig })
    return createSuccessResponse(result)
  } catch (error: unknown) {
    console.error('库存查询失败:', error)

    // 处理核心库错误
    if (error && typeof error === 'object' && 'type' in error) {
      const stockError = error as StockCheckError
      return createErrorResponse(stockError.type, stockError.message)
    }

    // 未知错误
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, errorMessage)
  }
})
