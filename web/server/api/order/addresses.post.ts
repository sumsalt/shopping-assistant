/**
 * 查询一手收货地址
 * POST /api/order/addresses
 *
 * 用户主动触发的请求，不走请求闸门。
 */

import { getOrderAdapter } from '@core'
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

    if (!adapterConfig.uid || !adapterConfig.token) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        '查询收货地址需要一手登录态，请先在账号管理中选择带登录态的账号'
      )
    }

    const adapter = getOrderAdapter('yishou', adapterConfig)
    if (!adapter) {
      return createErrorResponse(ErrorCode.PLATFORM_NOT_SUPPORTED, '当前平台不支持下单')
    }

    const addresses = await adapter.getAddresses()
    return createSuccessResponse({ addresses })
  } catch (error: unknown) {
    console.error('查询收货地址失败:', error)
    const message = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.API_ERROR, message)
  }
})
