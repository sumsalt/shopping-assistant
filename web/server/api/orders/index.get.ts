/**
 * 订单列表 API
 * GET /api/orders
 *
 * 与收藏夹同一套账号口径：
 *   - 不传 accountId：查当前使用账号的订单
 *   - 传 accountId：临时查该账号的订单，不改变当前使用账号
 *
 * 订单接口必须登录态，没有匿名降级；一手每页上限 10 条，也没有总数，
 * 所以 hasMore 由「本页是否满页」决定。
 */

import { getOrderList, normalizeOrderStatus, ORDER_LIST_PAGE_SIZE } from '@core'
import type { OrderListResult, StockCheckError } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import {
  resolveAdapterConfigForUser,
  resolveAdapterConfigForAccount,
  type ResolvedAdapterConfig,
} from '../../utils/adapterConfig'
import { getAccount } from '../../utils/accountStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录')
    }

    const query = getQuery(event)
    const page = parseInt(query.page as string) || 1
    /** 一手服务端硬限制每页 10 条，传更大也只返回 10 条，这里直接收敛 */
    const pageSize = Math.min(
      Math.max(parseInt(query.pageSize as string) || ORDER_LIST_PAGE_SIZE, 1),
      ORDER_LIST_PAGE_SIZE
    )
    /** 指定账号 ID：临时查看该账号的订单，不改变「当前账号」 */
    const accountId = typeof query.accountId === 'string' ? query.accountId.trim() : ''
    /** 状态 tab：非法值收敛成「全部」，避免把用户的手误变成空列表 */
    const status = normalizeOrderStatus(typeof query.status === 'string' ? query.status : '')

    if (page < 1) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '页码必须大于 0')
    }

    let resolved: ResolvedAdapterConfig
    if (accountId) {
      const target = getAccount(accountId)
      // 只允许查看自己名下的账号，避免越权使用他人抓包凭据
      if (!target || target.userId !== currentUser.username) {
        return createErrorResponse(ErrorCode.INVALID_PARAMS, '账号不存在或无权查看该账号的订单')
      }
      if (!target.requestProfile) {
        return createErrorResponse(ErrorCode.AUTH_REQUIRED, '该账号没有抓包请求信息，无法查看订单')
      }
      resolved = resolveAdapterConfigForAccount(target, true)
    } else {
      resolved = resolveAdapterConfigForUser(currentUser.username, true)
    }

    if (!resolved.hasCredential) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        accountId
          ? '该账号的抓包缺少 uid/token，无法查看订单'
          : '当前账号没有登录态，请先在账号管理选择账号'
      )
    }

    const result: OrderListResult = await getOrderList(
      { platform: 'yishou', page, pageSize, status },
      { adapterConfig: resolved.config }
    )

    return createSuccessResponse({
      ...result,
      // 带上本次使用的账号摘要，供页面标明正在查看谁的订单
      account: resolved.account
        ? { id: resolved.account.id, phone: resolved.account.phone }
        : null,
    })
  } catch (error: unknown) {
    console.error('订单列表查询失败:', error)

    if (error && typeof error === 'object' && 'type' in error) {
      const stockError = error as StockCheckError
      return createErrorResponse(stockError.type, stockError.message)
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, errorMessage)
  }
})
