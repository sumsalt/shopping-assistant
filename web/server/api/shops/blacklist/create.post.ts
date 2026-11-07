/**
 * 加入店铺黑名单
 * POST /api/shops/blacklist/create
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../../utils/response'
import { getCurrentUser } from '../../../utils/session'
import { addToBlacklist } from '../../../utils/shopBlacklistStore'
import { parseBlacklistInput } from '../../../utils/shopBlacklistValidate'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const parsed = parseBlacklistInput(body)
    if (!parsed.ok) {
      return createErrorResponse('INVALID_PARAMS', parsed.error)
    }

    const item = addToBlacklist(currentUser.username, parsed.value)
    if (!item) {
      return createErrorResponse('UNKNOWN_ERROR', '加入黑名单失败，请稍后重试')
    }

    return createSuccessResponse({
      item: {
        ...item,
        createdAt: item.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[ShopBlacklist] 加入失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '加入黑名单失败')
  }
})
