/**
 * 会话管理服务
 * 
 * 提供会话的创建、验证、销毁功能，使用内存存储会话数据
 */

import { randomBytes } from 'crypto'
import type { Session, User } from '../types/auth'
import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'

/** 会话存储（内存Map） */
const sessionStore = new Map<string, Session>()

/** 会话Cookie名称 */
export const SESSION_COOKIE_NAME = 'session_id'

/** 会话有效期（24小时，毫秒） */
const SESSION_DURATION = 24 * 60 * 60 * 1000

/** 会话ID长度（字节） */
const SESSION_ID_LENGTH = 32 // 256位

/**
 * 生成随机会话ID
 * 
 * @returns 十六进制格式的会话ID
 */
const generateSessionId = (): string => {
  return randomBytes(SESSION_ID_LENGTH).toString('hex')
}

/**
 * 创建新会话
 * 
 * @param user 用户信息
 * @returns 新创建的会话
 */
export const createSession = (user: User): Session => {
  const now = Date.now()
  const session: Session = {
    id: generateSessionId(),
    username: user.username,
    email: user.email,
    createdAt: now,
    expiresAt: now + SESSION_DURATION,
  }

  // 存储会话
  sessionStore.set(session.id, session)

  return session
}

/**
 * 获取会话（通过会话ID）
 * 
 * @param sessionId 会话ID
 * @returns 会话信息，未找到或已过期时返回null
 */
export const getSession = (sessionId: string): Session | null => {
  const session = sessionStore.get(sessionId)

  if (!session) {
    return null
  }

  // 检查会话是否过期
  if (Date.now() > session.expiresAt) {
    // 清除过期会话
    sessionStore.delete(sessionId)
    return null
  }

  return session
}

/**
 * 刷新会话过期时间（滑动过期）
 * 
 * @param sessionId 会话ID
 * @returns 是否刷新成功
 */
export const refreshSession = (sessionId: string): boolean => {
  const session = sessionStore.get(sessionId)

  if (!session) {
    return false
  }

  // 检查会话是否过期
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId)
    return false
  }

  // 刷新过期时间
  session.expiresAt = Date.now() + SESSION_DURATION
  sessionStore.set(sessionId, session)

  return true
}

/**
 * 销毁会话
 * 
 * @param sessionId 会话ID
 */
export const destroySession = (sessionId: string): void => {
  sessionStore.delete(sessionId)
}

/**
 * 从请求中获取会话ID
 * 
 * @param event H3事件
 * @returns 会话ID或null
 */
export const getSessionIdFromEvent = (event: H3Event): string | null => {
  return getCookie(event, SESSION_COOKIE_NAME) || null
}

/**
 * 从请求中获取当前会话
 * 
 * @param event H3事件
 * @returns 会话信息或null
 */
export const getSessionFromEvent = (event: H3Event): Session | null => {
  const sessionId = getSessionIdFromEvent(event)
  if (!sessionId) {
    return null
  }
  return getSession(sessionId)
}

/**
 * 设置会话Cookie
 * 
 * @param event H3事件
 * @param sessionId 会话ID
 */
export const setSessionCookie = (event: H3Event, sessionId: string): void => {
  const isProduction = process.env.NODE_ENV === 'production'
  
  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION / 1000, // 秒为单位
  })
}

/**
 * 清除会话Cookie
 * 
 * @param event H3事件
 */
export const clearSessionCookie = (event: H3Event): void => {
  deleteCookie(event, SESSION_COOKIE_NAME, {
    path: '/',
  })
}

/**
 * 从请求获取当前用户信息
 * 
 * @param event H3事件
 * @returns 用户信息或null
 */
export const getCurrentUser = (event: H3Event): User | null => {
  const session = getSessionFromEvent(event)
  if (!session) {
    return null
  }

  return {
    username: session.username,
    email: session.email,
  }
}

/**
 * 清理所有过期会话（可定期调用）
 */
export const cleanupExpiredSessions = (): void => {
  const now = Date.now()
  for (const [sessionId, session] of sessionStore.entries()) {
    if (now > session.expiresAt) {
      sessionStore.delete(sessionId)
    }
  }
}
