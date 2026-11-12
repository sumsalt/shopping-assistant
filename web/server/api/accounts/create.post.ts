/**
 * 新增账号
 * POST /api/accounts/create
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { createAccount, getAccountByPhone } from '../../utils/accountStore'
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

    // 同一用户下手机号唯一：重复提交（双击 / 以为没保存成功再点一次）不再落第二条
    if (getAccountByPhone(currentUser.username, parsed.value.phone)) {
      return createErrorResponse('DUPLICATE', '该手机号已添加过账号，请直接在列表中使用或编辑')
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
