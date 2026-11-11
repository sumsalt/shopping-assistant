/**
 * SKU 查询 API
 * GET /api/stock/skus/:productNo
 */

import { getProductSkus } from '@core'
import type { ProductSkuRequest, ProductSkuResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../../utils/response'
import { getCurrentUser } from '../../../utils/session'
import { resolveAdapterConfigForUser } from '../../../utils/adapterConfig'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
    }

    // 获取路由参数
    const productNo = getRouterParam(event, 'productNo')

    if (!productNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品货号不能为空')
    }

    // SKU 详情需要登录态：服务端按当前账号取快照
    const { config: adapterConfig, hasCredential } = resolveAdapterConfigForUser(
      currentUser.username,
      true
    )
    if (!hasCredential) {
      return createErrorResponse(ErrorCode.AUTH_REQUIRED, '当前账号没有登录态，请先在账号管理选择账号')
    }

    // 构建请求参数
    const request: ProductSkuRequest = {
      platform: 'yishou',
      productNo: productNo,
    }

    // 调用核心库获取 SKU
    const result: ProductSkuResult = await getProductSkus(request, { adapterConfig })

    return createSuccessResponse(result)
  } catch (error: unknown) {
    console.error('SKU 查询失败:', error)

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
