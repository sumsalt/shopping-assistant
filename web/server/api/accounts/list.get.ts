/**
 * 查询当前用户的账号列表
 * GET /api/accounts/list
 */

import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listAccounts } from '../../utils/accountStore'
import { toAccountView } from '../../utils/accountMask'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const accounts = listAccounts(currentUser.username)

    return createSuccessResponse({
      accounts: accounts.map(toAccountView),
      total: accounts.length,
    })
  } catch (error) {
    console.error('[Accounts] 查询账号列表失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '查询账号列表失败')
  }
})
