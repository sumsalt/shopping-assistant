/**
 * 关键词商品搜索 API
 * POST /api/stock/search
 *
 * 使用当前账号的一手登录态（保留 uid/token）：接口只在登录态下返回真实
 * shop_price（拿货价），匿名请求会把它降级成 "??.??"。因此要求账号快照
 * 具备凭证，缺凭证时直接提示，避免静默退化成匿名、列表价格全部隐藏。
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

  // 带登录态：按当前账号快照保留 uid/token，列表才能拿到真实拿货价
  const { config: adapterConfig, hasCredential } = resolveAdapterConfigForUser(
    currentUser.username,
    true
  )
  if (!hasCredential) {
    return createErrorResponse(
      ErrorCode.AUTH_REQUIRED,
      '关键词搜索需要一手登录态，请先在账号管理中选择带登录态的账号'
    )
  }

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
