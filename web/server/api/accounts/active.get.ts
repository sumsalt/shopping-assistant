/**
 * 查询当前使用账号
 * GET /api/accounts/active
 *
 * 只返回脱敏视图：前端需要知道「当前是谁 / 能否登录」，但不再持有请求快照。
 * 账号参数由服务端在发请求时从库里取，避免凭证在浏览器与 API 之间来回传。
 */

import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getActiveAccount } from '../../utils/accountStore'
import { toAccountView } from '../../utils/accountMask'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const account = getActiveAccount(currentUser.username)
    return createSuccessResponse({ account: account ? toAccountView(account) : null })
  } catch (error) {
    console.error('[Accounts] 查询当前账号失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '查询当前账号失败')
  }
})
