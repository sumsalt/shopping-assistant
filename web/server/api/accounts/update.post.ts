/**
 * 更新账号
 * POST /api/accounts/update
 *
 * 密码和 token 留空表示不修改，前端编辑时不会把掩码值回填到输入框。
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getAccount, getAccountByPhone, updateAccount } from '../../utils/accountStore'
import { parseAccountInput } from '../../utils/accountValidate'
import { toAccountView } from '../../utils/accountMask'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return createErrorResponse('INVALID_PARAMS', '缺少账号 ID')
    }

    const existing = getAccount(id)
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '账号不存在')
    }
    if (existing.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权修改此账号')
    }

    const parsed = parseAccountInput(body)
    if (!parsed.ok) {
      return createErrorResponse('INVALID_PARAMS', parsed.error)
    }

    // 改手机号时同样防重复：不能改成同用户下另一个账号的手机号（排除自己）
    const duplicate = getAccountByPhone(currentUser.username, parsed.value.phone)
    if (duplicate && duplicate.id !== id) {
      return createErrorResponse('DUPLICATE', '该手机号已添加过账号，不能重复使用')
    }

    const account = updateAccount(id, parsed.value)
    if (!account) {
      return createErrorResponse('UNKNOWN_ERROR', '保存失败，请稍后重试')
    }

    return createSuccessResponse({ account: toAccountView(account) })
  } catch (error) {
    console.error('[Accounts] 更新账号失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '更新账号失败')
  }
})
