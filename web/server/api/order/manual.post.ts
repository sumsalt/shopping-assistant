/**
 * 手动一键下单
 * POST /api/order/manual
 *
 * 不选规格：把所有「有货的 SKU」各下 1 件，总量不超过 MANUAL_ORDER_MAX_NUM（5 件）。
 * 直接建单锁库存，支付仍需到一手 App 内完成。用于详情页的「一键下单」按钮。
 */

import { getOrderAdapter, MANUAL_ORDER_MAX_NUM, placeAutoOrder } from '@core'
import { createErrorResponse, createSuccessResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 下单链路必须带一手登录态
    const { config: adapterConfig, hasCredential } = resolveAdapterConfigForUser(
      currentUser.username,
      true
    )

    const body = await readBody(event)
    const goodsId = String(body?.goodsId || '')
    const goodsNo = String(body?.goodsNo || '')

    if (!hasCredential) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        '下单需要一手登录态，请先在账号管理中选择带登录态的账号'
      )
    }

    if (!goodsId || !goodsNo) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '缺少商品 ID 或货号')
    }

    const adapter = getOrderAdapter('yishou', adapterConfig)
    if (!adapter) {
      return createErrorResponse(ErrorCode.PLATFORM_NOT_SUPPORTED, '当前平台不支持下单')
    }

    // onePerSku：每个有货规格各 1 件；num 作为件数总上限（封顶 5 件）
    const result = await placeAutoOrder(adapter, {
      goodsId,
      goodsNo,
      config: { enabled: true, num: MANUAL_ORDER_MAX_NUM },
      onePerSku: true,
    })

    return createSuccessResponse(result)
  } catch (error: unknown) {
    console.error('手动下单失败:', error)
    const message = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.API_ERROR, message)
  }
})
