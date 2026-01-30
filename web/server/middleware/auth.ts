/**
 * 服务端认证中间件
 * 
 * 验证所有API请求（除白名单外）的认证状态
 */

import { defineEventHandler, createError, getRequestURL } from 'h3'
import { getSessionFromEvent, refreshSession } from '../utils/session'

/** 不需要认证的API路径白名单 */
const AUTH_WHITELIST = [
  '/api/auth/login',
  '/api/auth/logout',
]

/**
 * 检查路径是否在白名单中
 */
const isWhitelisted = (path: string): boolean => {
  return AUTH_WHITELIST.some(whitePath => path.startsWith(whitePath))
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const path = url.pathname

  // 只处理API请求
  if (!path.startsWith('/api')) {
    return
  }

  // 检查是否在白名单中
  if (isWhitelisted(path)) {
    return
  }

  // 验证会话
  const session = getSessionFromEvent(event)

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      data: {
        code: 401,
        message: '未授权，请先登录',
      },
    })
  }

  // 刷新会话过期时间（滑动过期）
  refreshSession(session.id)

  // 将用户信息添加到事件上下文，供后续处理器使用
  event.context.user = {
    username: session.username,
    email: session.email,
  }
})
