/**
 * 关键词商品搜索 API
 * POST /api/stock/search
 *
 * 与库存查询一样走匿名配置（剔除 uid/token，**不带登录信息**）。
 * 匿名接口返回商品列表，但 shop_price 为 "??.??"，真实价格需进详情页查看。
 */

import { searchGoodsByKeyword } from '@core'
import type { StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'

interface SearchBody {
  keyword?: string
  page?: number
}

export default defineEventHandler(async (event) => {
  const currentUser = getCurrentUser(event)
  if (!currentUser) {
    return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
  }

  const body = await readBody<SearchBody>(event)
  const keyword = (body?.keyword ?? '').trim()
  if (!keyword) {
    return createErrorResponse(ErrorCode.INVALID_PARAMS, '搜索关键词不能为空')
  }

  // 不带登录信息：按当前账号快照剔除 uid/token，走匿名限流桶
  const { config: adapterConfig } = resolveAdapterConfigForUser(currentUser.username, false)

  try {
    const result = await searchGoodsByKeyword(
      { keyword, page: body?.page },
      { adapterConfig }
    )
    return createSuccessResponse(result)
  } catch (error) {
    console.error('关键词搜索失败:', error)

    if (error && typeof error === 'object' && 'type' in error) {
      const stockError = error as StockCheckError
      return createErrorResponse(stockError.type, stockError.message)
    }

    const message = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, message)
  }
})
