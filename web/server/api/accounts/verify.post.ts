/**
 * 校验账号的登录态
 * POST /api/accounts/verify
 *
 * 一手把 (uid, token, udid) 作为三元组校验，任一不匹配只返回「请登录」，
 * 而可匿名接口又只把价格静默降级成 `??.??`。用户很难判断抓包是否还能用，
 * 所以这里用必须登录的 /users/get_user_info 做探针，把结论直接回给页面。
 *
 * 安全边界同 /api/accounts/profile：登录态 + 账号归属校验，只回结论不回凭证。
 */

import { readBody } from 'h3'
import { checkYishouAuth } from '@core'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getAccount } from '../../utils/accountStore'
import { profileToAdapterConfig } from '../../utils/adapterConfig'

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
      return createErrorResponse('FORBIDDEN', '无权操作此账号')
    }

    // 代理是全局设置，存在前端；这里只在显式传入时使用
    const config = profileToAdapterConfig(account.requestProfile, {
      proxyUrl: typeof body?.proxyUrl === 'string' ? body.proxyUrl : undefined,
      proxyEnabled: body?.proxyEnabled === '1' ? '1' : '0',
    })

    const result = await checkYishouAuth(config)
    return createSuccessResponse(result)
  } catch (error) {
    console.error('[Accounts] 登录态校验失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '校验失败，请稍后重试')
  }
})
