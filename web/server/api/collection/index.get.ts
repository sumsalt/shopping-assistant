/**
 * 收藏夹查询 API
 * GET /api/collection
 */

import { checkCollectionStock } from '@core'
import type { CollectionStockRequest, CollectionStockCheckResult, StockCheckError } from '@core'
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

    // 获取查询参数
    const query = getQuery(event)
    const page = parseInt(query.page as string) || 1
    const pageSize = parseInt(query.pageSize as string) || 20
    /** 指定账号 ID：临时查看该账号的收藏夹，不改变「当前账号」 */
    const accountId = typeof query.accountId === 'string' ? query.accountId.trim() : ''

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

    // 收藏夹需要登录态：默认取当前账号；带 accountId 时临时取指定账号的抓包快照
    let resolved: ResolvedAdapterConfig
    if (accountId) {
      const target = getAccount(accountId)
      // 只允许查看自己名下的账号，避免越权使用他人抓包凭据
      if (!target || target.userId !== currentUser.username) {
        return createErrorResponse(ErrorCode.INVALID_PARAMS, '账号不存在或无权查看该账号的收藏夹')
      }
      if (!target.requestProfile) {
        return createErrorResponse(ErrorCode.AUTH_REQUIRED, '该账号没有抓包请求信息，无法查看收藏夹')
      }
      resolved = resolveAdapterConfigForAccount(target, true)
    } else {
      resolved = resolveAdapterConfigForUser(currentUser.username, true)
    }

    if (!resolved.hasCredential) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        accountId
          ? '该账号的抓包缺少 uid/token，无法查看收藏夹'
          : '当前账号没有登录态，请先在账号管理选择账号'
      )
    }

    // 调用核心库查询收藏夹
    const result: CollectionStockCheckResult = await checkCollectionStock(request, {
      adapterConfig: resolved.config,
    })

    // 返回结果；带上本次使用的账号摘要，供页面标明正在查看谁的收藏夹
    return createSuccessResponse({
      ...result,
      page,
      pageSize,
      hasMore: result.total > page * pageSize,
      account: resolved.account
        ? { id: resolved.account.id, phone: resolved.account.phone, title: resolved.account.title }
        : null,
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
