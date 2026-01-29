/**
 * SKU 查询 API
 * GET /api/stock/skus/:productNo
 */

import { getProductSkus } from '@core'
import type { ProductSkuRequest, ProductSkuResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  try {
    // 获取路由参数
    const productNo = getRouterParam(event, 'productNo')

    if (!productNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品货号不能为空')
    }

    // 获取查询参数中的配置（uid、token、openid 为可选）
    const query = getQuery(event)
    const uid = (query.uid as string) || ''
    const token = (query.token as string) || ''
    const openid = (query.openid as string) || ''

    // 构建请求参数
    const request: ProductSkuRequest = {
      platform: 'yishou',
      productNo: productNo,
    }

    // 构建适配器配置
    const adapterConfig = {
      uid,
      token,
      openid,
      model: (query.model as string) || 'iPhone 14 Pro Max',
      version: (query.version as string) || '5.11.0',
      version_name: (query.version_name as string) || '5.11.0',
      wx_version_name: (query.wx_version_name as string) || '8.0.43',
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
