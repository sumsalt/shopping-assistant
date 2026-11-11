/**
 * 读取账号的完整明文请求快照
 * POST /api/accounts/profile
 *
 * 「设为当前账号」时调用：列表接口只给脱敏副本，这里按 id 取回完整的
 * params / headers / channel，缓存到前端 config store，用于后续发请求。
 *
 * 安全边界与 /api/accounts/reveal 一致：登录态 + 账号归属校验，
 * 明文不经过列表接口，避免随手截图 / 列表响应泄露。
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getAccount } from '../../utils/accountStore'

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

    const account = getAccount(id)
    if (!account) {
      return createErrorResponse('NOT_FOUND', '账号不存在')
    }
    if (account.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权查看此账号')
    }

    return createSuccessResponse({
      id: account.id,
      phone: account.phone,
      uin: account.uin,
      requestProfile: account.requestProfile,
    })
  } catch (error) {
    console.error('[Accounts] 读取账号请求快照失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '读取失败')
  }
})
