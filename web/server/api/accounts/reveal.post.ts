/**
 * 读取账号凭据明文
 * POST /api/accounts/reveal
 *
 * 列表接口只给掩码，点「显示」时才按字段单独取一次明文。
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getAccount } from '../../utils/accountStore'

/** 允许读取的字段 */
const REVEALABLE_FIELDS = new Set(['password', 'token'])

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const id = typeof body?.id === 'string' ? body.id : ''
    const field = typeof body?.field === 'string' ? body.field : ''

    if (!id) {
      return createErrorResponse('INVALID_PARAMS', '缺少账号 ID')
    }
    if (!REVEALABLE_FIELDS.has(field)) {
      return createErrorResponse('INVALID_PARAMS', '不支持的字段')
    }

    const account = getAccount(id)
    if (!account) {
      return createErrorResponse('NOT_FOUND', '账号不存在')
    }
    if (account.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权查看此账号')
    }

    const value = field === 'password' ? account.password : account.token

    return createSuccessResponse({ field, value })
  } catch (error) {
    console.error('[Accounts] 读取账号凭据失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '读取失败')
  }
})
