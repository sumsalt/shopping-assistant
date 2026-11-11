/**
 * 新增账号
 * POST /api/accounts/create
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { createAccount } from '../../utils/accountStore'
import { parseAccountInput } from '../../utils/accountValidate'
import { toAccountView } from '../../utils/accountMask'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const parsed = parseAccountInput(body)
    if (!parsed.ok) {
      return createErrorResponse('INVALID_PARAMS', parsed.error)
    }

    const account = createAccount(currentUser.username, parsed.value)
    if (!account) {
      return createErrorResponse('UNKNOWN_ERROR', '保存失败，请稍后重试')
    }

    return createSuccessResponse({ account: toAccountView(account) })
  } catch (error) {
    console.error('[Accounts] 新增账号失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '新增账号失败')
  }
})
