/**
 * 获取当前用户信息API接口
 * 
 * GET /api/auth/me
 */

import { defineEventHandler, createError } from 'h3'
import { getCurrentUser, getSessionIdFromEvent, refreshSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  // 获取当前用户
  const user = getCurrentUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '未授权，请先登录',
    })
  }

  // 刷新会话过期时间（滑动过期）
  const sessionId = getSessionIdFromEvent(event)
  if (sessionId) {
    refreshSession(sessionId)
  }

  return {
    success: true,
    user,
  }
})
