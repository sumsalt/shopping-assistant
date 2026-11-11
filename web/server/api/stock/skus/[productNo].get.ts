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

    // 规格明细接口拒绝匿名（实测返回「请先登录」），必须用登录态快照。
    // 纯到货提醒的用户如果没选账号，前端不会调用这个接口，按「全部规格」处理。
    const { config: adapterConfig, hasCredential } = resolveAdapterConfigForUser(
      currentUser.username,
      true
    )
    if (!hasCredential) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        '查询规格需要一手登录态，请先在账号管理中选择带登录态的账号'
      )
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
