/**
 * 库存查询 API
 * POST /api/stock/check
 */

import { checkStock } from '@core'
import type { StockCheckRequest, StockCheckResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'

// 请求体类型
interface CheckStockBody {
  productId: string
  sku?: string
  config?: {
    uid?: string
    token?: string
    openid?: string
    model?: string
    version?: string
    version_name?: string
    wx_version_name?: string
  }
}

export default defineEventHandler(async (event) => {
  try {
    // 读取请求体
    const body = await readBody<CheckStockBody>(event)

    // 验证参数
    if (!body.productId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品 ID 不能为空')
    }

    // config 为可选，uid、token、openid 也为可选
    const config = body.config || {}

    // 构建请求参数
    const request: StockCheckRequest = {
      platform: 'yishou',
      productId: body.productId,
      sku: body.sku,
    }

    // 构建适配器配置
    const adapterConfig = {
      uid: config.uid || '',
      token: config.token || '',
      openid: config.openid || '',
      model: config.model || 'iPhone 14 Pro Max',
      version: config.version || '5.11.0',
      version_name: config.version_name || '5.11.0',
      wx_version_name: config.wx_version_name || '8.0.43',
    }

    // 调用核心库查询库存
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
