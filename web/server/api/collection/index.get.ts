/**
 * 收藏夹查询 API
 * GET /api/collection
 */

import { checkCollectionStock } from '@core'
import type { CollectionStockRequest, CollectionStockCheckResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'

export default defineEventHandler(async (event) => {
  try {
    // 获取查询参数
    const query = getQuery(event)
    const page = parseInt(query.page as string) || 1
    const pageSize = parseInt(query.pageSize as string) || 20

    // 获取配置（uid、token、openid 为可选）
    const uid = (query.uid as string) || ''
    const token = (query.token as string) || ''
    const openid = (query.openid as string) || ''

    // 验证分页参数
    if (page < 1) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '页码必须大于 0')
    }

    if (pageSize < 1 || pageSize > 100) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '每页数量必须在 1-100 之间')
    }

    // 构建请求参数
    const request: CollectionStockRequest = {
      platform: 'yishou',
      page,
      pageSize,
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
      proxyUrl: query.proxyUrl as string | undefined,
      proxyEnabled: (query.proxyEnabled as '1' | '0') || '0',
    }

    // 调用核心库查询收藏夹
    const result: CollectionStockCheckResult = await checkCollectionStock(request, { adapterConfig })

    // 返回结果
    return createSuccessResponse({
      ...result,
      page,
      pageSize,
      hasMore: result.total > page * pageSize,
    })
  } catch (error: unknown) {
    console.error('收藏夹查询失败:', error)

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
