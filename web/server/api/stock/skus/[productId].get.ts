/**
 * SKU 查询 API
 * GET /api/stock/skus/:productId
 *
 * 底层只调 `get_goods_info_v2`（与 App 详情页同一个接口），一次拿全 SKU、价格、
 * 库存和收藏标记。该接口匿名可用：当前账号有登录态时价格是拿货价，没有登录态
 * 时回落成游客参考价（`priceNote` 标注），因此这里不再强制要求登录态。
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

    const productId = getRouterParam(event, 'productId')
    if (!productId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品 ID 不能为空')
    }

    // 有登录态就用登录态（拿货价 + 真实收藏状态），没有也能查（游客参考价）
    const { config: adapterConfig } = resolveAdapterConfigForUser(currentUser.username)

    const request: ProductSkuRequest = {
      platform: 'yishou',
      productId,
    }

    // 页面手动查看详情：走 manual flow（bypass 闸门），避免被后台监控排队拖慢
    const result: ProductSkuResult = await getProductSkus(request, { adapterConfig, flow: 'manual' })

    return createSuccessResponse(result)
  } catch (error: unknown) {
    console.error('SKU 查询失败:', error)

    if (error && typeof error === 'object' && 'type' in error) {
      const stockError = error as StockCheckError
      return createErrorResponse(stockError.type, stockError.message)
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, errorMessage)
  }
})
