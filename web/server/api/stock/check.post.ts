/**
 * 库存查询 API
 * POST /api/stock/check
 *
 * 只查询单个商品（批量 ID 查询已下线）。使用当前账号的一手登录态
 * （保留 uid/token），返回的价格是真实拿货价。
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

    // 带登录态：按当前账号快照保留 uid/token，缺凭证直接提示
    const { config: adapterConfig, hasCredential } = resolveAdapterConfigForUser(
      currentUser.username,
      true
    )
    if (!hasCredential) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        '库存查询需要一手登录态，请先在账号管理中选择带登录态的账号'
      )
    }

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
