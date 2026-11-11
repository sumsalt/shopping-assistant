/**
 * 设置 / 清除当前使用账号
 * POST /api/accounts/active
 *
 * body.id 为空表示回到匿名模式。
 * 「当前账号」存服务端（accounts.is_active），后续所有请求按登录用户自动取用。
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getAccount, setActiveAccount } from '../../utils/accountStore'
import { toAccountView } from '../../utils/accountMask'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const rawId = body?.id
    if (rawId !== undefined && rawId !== null && typeof rawId !== 'string') {
      return createErrorResponse('INVALID_PARAMS', '账号 ID 格式错误')
    }
    const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : null

    if (id) {
      const target = getAccount(id)
      if (!target) {
        return createErrorResponse('NOT_FOUND', '账号不存在')
      }
      if (target.userId !== currentUser.username) {
        return createErrorResponse('FORBIDDEN', '无权使用此账号')
      }
    }

    const account = setActiveAccount(currentUser.username, id)
    if (id && !account) {
      return createErrorResponse('UNKNOWN_ERROR', '设置当前账号失败')
    }

    return createSuccessResponse({ account: account ? toAccountView(account) : null })
  } catch (error) {
    console.error('[Accounts] 设置当前账号失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '设置当前账号失败')
  }
})
