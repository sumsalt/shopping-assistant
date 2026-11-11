/**
 * 收藏夹查询 API
 * GET /api/collection
 */

import { checkCollectionStock } from '@core'
import type { CollectionStockRequest, CollectionStockCheckResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
    }

    // 获取查询参数
    const query = getQuery(event)
    const page = parseInt(query.page as string) || 1
    const pageSize = parseInt(query.pageSize as string) || 20

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

    // 收藏夹需要登录态：服务端按当前账号取快照
    const { config: adapterConfig, hasCredential } = resolveAdapterConfigForUser(
      currentUser.username,
      true
    )
    if (!hasCredential) {
      return createErrorResponse(ErrorCode.AUTH_REQUIRED, '当前账号没有登录态，请先在账号管理选择账号')
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
