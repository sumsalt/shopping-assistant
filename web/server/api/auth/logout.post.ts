/**
 * 登出API接口
 * 
 * POST /api/auth/logout
 */

import { defineEventHandler } from 'h3'
import { 
  getSessionIdFromEvent, 
  destroySession, 
  clearSessionCookie 
} from '../../utils/session'

export default defineEventHandler(async (event) => {
  // 获取当前会话ID
  const sessionId = getSessionIdFromEvent(event)

  // 销毁会话（如果存在）
  if (sessionId) {
    destroySession(sessionId)
  }

  // 清除Cookie
  clearSessionCookie(event)

  return {
    success: true,
    message: '登出成功',
  }
})
