/**
 * 下单预检
 * POST /api/order/precheck
 *
 * 完整走一遍「地址 → 规格 → 加购 → 结算」，然后清掉购物车，不生成订单。
 * 用于创建自动下单任务前确认参数可用、预计多少钱。
 */

import { getOrderAdapter, MAX_AUTO_ORDER_NUM, precheckAutoOrder } from '@core'
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const adapterConfig = body?.adapterConfig || {}
    const goodsId = String(body?.goodsId || '')
    const goodsNo = String(body?.goodsNo || '')
    const num = Number(body?.num ?? 1)

    if (!adapterConfig.uid || !adapterConfig.token) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        '下单预检需要一手登录态，请先在账号管理中选择带登录态的账号'
      )
    }

    if (!goodsId || !goodsNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '缺少商品 ID 或货号')
    }

    if (!Number.isFinite(num) || num < 1 || num > MAX_AUTO_ORDER_NUM) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `购买件数需在 1~${MAX_AUTO_ORDER_NUM} 之间`
      )
    }

    const adapter = getOrderAdapter('yishou', adapterConfig)
    if (!adapter) {
      return createErrorResponse(ErrorCode.PLATFORM_NOT_SUPPORTED, '当前平台不支持下单')
    }

    const result = await precheckAutoOrder(adapter, {
      goodsId,
      goodsNo,
      config: {
        enabled: true,
        num,
        ...(body?.addressId ? { addressId: String(body.addressId) } : {}),
      },
    })

    return createSuccessResponse(result)
  } catch (error: unknown) {
    console.error('下单预检失败:', error)
    const message = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.API_ERROR, message)
  }
})
