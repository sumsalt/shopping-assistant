/**
 * SKU 查询 API
 * GET /api/stock/skus/:productNo
 */

import { getProductSkus } from '@core'
import type { ProductSkuRequest, ProductSkuResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../../utils/response'
import { readAdapterConfigFromQuery } from '../../../utils/adapterConfig'

export default defineEventHandler(async (event) => {
  try {
    // 获取路由参数
    const productNo = getRouterParam(event, 'productNo')

    if (!productNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品货号不能为空')
    }

    // 前端按当前账号组装好的完整快照（含登录态），原样透传给适配器
    const query = getQuery(event)
    const adapterConfig = readAdapterConfigFromQuery(query as Record<string, unknown>)

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
