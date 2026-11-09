/**
 * 会话管理服务
 *
 * 提供会话的创建、验证、销毁功能。
 *
 * 存储策略：内存 Map 作为读缓存，SQLite 作为持久层。
 * 早先只放内存，进程重启（部署 / PM2 restart / 崩溃）会把所有会话清空，
 * 表现为「每次发版都要重新登录」，因此改为落盘。
 *
 * 过期策略：滑动过期，默认 30 天（可用 SESSION_DAYS 覆盖）。
 * 为了不给每个 API 请求都写一次库，剩余有效期超过一半时不做续期。
 */

import { createHash, randomBytes } from 'crypto'
import type { Session, User } from '../types/auth'
import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'
import { getDb } from './db'

/** 会话存储（内存缓存，key 为 sessionId 的哈希） */
const sessionStore = new Map<string, Session>()

/** 会话Cookie名称 */
export const SESSION_COOKIE_NAME = 'session_id'

/** 会话有效期（天），默认 30 天 */
const SESSION_DAYS = (() => {
  const raw = Number(process.env.SESSION_DAYS)
  return Number.isFinite(raw) && raw > 0 ? raw : 30
})()

/** 会话有效期（毫秒） */
const SESSION_DURATION = SESSION_DAYS * 24 * 60 * 60 * 1000

/** 会话ID长度（字节） */
const SESSION_ID_LENGTH = 32 // 256位

/** 上次清理过期会话的时间（避免每次创建会话都扫表） */
let lastCleanupAt = 0

/** 数据库中的会话行 */
interface SessionRow {
  id: string
  username: string
  email: string
  created_at: number
  expires_at: number
}

/**
 * 会话ID 单向哈希：库里只存哈希，不存可直接使用的 cookie 值
 */
const hashSessionId = (sessionId: string): string =>
  createHash('sha256').update(sessionId).digest('hex')

/**
 * 生成随机会话ID
 *
 * @returns 十六进制格式的会话ID
 */
const generateSessionId = (): string => {
  return randomBytes(SESSION_ID_LENGTH).toString('hex')
}

/**
 * 写入（或更新过期时间）一条会话记录
 */
const persistSession = (hashedId: string, session: Session): void => {
  try {
    getDb()
      ?.prepare(
        `INSERT INTO sessions (id, username, email, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at`
      )
      .run(hashedId, session.username, session.email, session.createdAt, session.expiresAt)
  } catch (error) {
    // 落盘失败不影响本次登录，最多是重启后需要重新登录
    console.error('[Session] 会话落盘失败:', error)
  }
}

/**
 * 删除一条会话记录（内存 + 数据库）
 */
const removeSession = (hashedId: string): void => {
  sessionStore.delete(hashedId)
  try {
    getDb()?.prepare('DELETE FROM sessions WHERE id = ?').run(hashedId)
  } catch (error) {
    console.error('[Session] 会话删除失败:', error)
  }
}

/**
 * 清理所有过期会话
 */
export const cleanupExpiredSessions = (): void => {
  const now = Date.now()

  for (const [hashedId, session] of sessionStore.entries()) {
    if (now > session.expiresAt) {
      sessionStore.delete(hashedId)
    }
  }

  try {
    getDb()?.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now)
  } catch (error) {
    console.error('[Session] 过期会话清理失败:', error)
  }
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

  const hashedId = hashSessionId(session.id)

  // 存储会话：内存缓存 + 落盘
  sessionStore.set(hashedId, session)
  persistSession(hashedId, session)

  // 顺带清理过期记录（每小时最多一次）
  if (now - lastCleanupAt > 60 * 60 * 1000) {
    lastCleanupAt = now
    cleanupExpiredSessions()
  }

  return session
}

/**
 * 获取会话（通过会话ID）
 *
 * 内存未命中时回表查询，覆盖进程重启后的首次访问。
 *
 * @param sessionId 会话ID
 * @returns 会话信息，未找到或已过期时返回null
 */
export const getSession = (sessionId: string): Session | null => {
  const hashedId = hashSessionId(sessionId)
  let session = sessionStore.get(hashedId)

  // 内存没有（刚重启）→ 从数据库恢复
  if (!session) {
    try {
      const row = getDb()
        ?.prepare(
          'SELECT id, username, email, created_at, expires_at FROM sessions WHERE id = ?'
        )
        .get(hashedId) as SessionRow | undefined

      if (row) {
        session = {
          id: sessionId,
          username: row.username,
          email: row.email,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        }
        sessionStore.set(hashedId, session)
      }
    } catch (error) {
      console.error('[Session] 会话读取失败:', error)
    }
  }

  if (!session) {
    return null
  }

  // 检查会话是否过期
  if (Date.now() > session.expiresAt) {
    removeSession(hashedId)
    return null
  }

  return session
}

/**
 * 刷新会话过期时间（滑动过期）
 *
 * 剩余有效期超过一半时直接返回，避免每个 API 请求都写库。
 *
 * @param sessionId 会话ID
 * @returns 是否刷新成功
 */
export const refreshSession = (sessionId: string): boolean => {
  const session = getSession(sessionId)

  if (!session) {
    return false
  }

  const now = Date.now()

  // 还有大半有效期，不必续期
  if (session.expiresAt - now > SESSION_DURATION / 2) {
    return true
  }

  session.expiresAt = now + SESSION_DURATION
  const hashedId = hashSessionId(sessionId)
  sessionStore.set(hashedId, session)
  persistSession(hashedId, session)

  return true
}

/**
 * 销毁会话
 *
 * @param sessionId 会话ID
 */
export const destroySession = (sessionId: string): void => {
  removeSession(hashSessionId(sessionId))
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
  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: false,
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
