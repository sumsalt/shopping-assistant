/**
 * 关键词商品搜索 API
 * POST /api/stock/search
 *
 * 按当前账号快照原样回放请求参数，不主动剔除 uid/token：带登录态时返回真实
 * shop_price（拿货价）；账号没有登录态也能正常返回商品列表，只是价格被降级成
 * "??.??"（映射层归一成无价格，由前端兜底）。这里不校验账号是否具备凭证。
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

  // 不主动去掉登录态：按当前账号快照完整回放（有凭证就带上，没有也能搜索）
  const { config: adapterConfig } = resolveAdapterConfigForUser(currentUser.username, true)

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
