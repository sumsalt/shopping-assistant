/**
 * 库存查询 API
 * POST /api/stock/check
 * 支持单个或批量查询
 */

import { checkStock, checkStockBatch } from '@core'
import type { StockCheckRequest, StockCheckResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'

// 请求体类型
interface CheckStockBody {
  productId?: string | string[]
  sku?: string | string[]
  config?: {
    uid?: string
    token?: string
    openid?: string
    model?: string
    version?: string
    version_name?: string
    wx_version_name?: string
    proxyUrl?: string
    proxyEnabled?: '1' | '0'
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

    // 构建适配器配置
    const adapterConfig = {
      // uid: config.uid || '',
      // token: config.token || '',
      openid: config.openid || '',
      model: config.model || 'iPhone 14 Pro Max',
      version: config.version || '5.11.0',
      version_name: config.version_name || '5.11.0',
      wx_version_name: config.wx_version_name || '8.0.43',
      proxyUrl: config.proxyUrl,
      proxyEnabled: config.proxyEnabled,
    }

    // 判断是单个查询还是批量查询
    if (Array.isArray(body.productId)) {
      // 批量查询
      const productIds = body.productId as string[]
      const skus = body.sku ? (Array.isArray(body.sku) ? body.sku : undefined) : undefined

      // 调用核心库批量查询库存
      const result = await checkStockBatch(
        {
          platform: 'yishou',
          productIds,
          skus,
        },
        { adapterConfig }
      )

      return createSuccessResponse(result)
    } else {
      // 单个查询
      const request: StockCheckRequest = {
        platform: 'yishou',
        productId: body.productId as string,
        sku: body.sku as string | undefined,
      }

      // 调用核心库查询库存
      const result: StockCheckResult = await checkStock(request, { adapterConfig })

      return createSuccessResponse(result)
    }
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
