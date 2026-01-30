/**
 * 登录API接口
 * 
 * POST /api/auth/login
 */

import bcrypt from 'bcryptjs'
import { defineEventHandler, readBody, createError } from 'h3'
import type { LoginRequest, LoginResponse } from '../../types/auth'
import { findUserByUsername } from '../../utils/userConfig'
import { createSession, setSessionCookie } from '../../utils/session'

export default defineEventHandler(async (event): Promise<LoginResponse> => {
  try {
    // 读取请求体
    const body = await readBody<LoginRequest>(event)

    // 参数验证
    if (!body || !body.username || !body.password) {
      throw createError({
        statusCode: 400,
        message: '用户名和密码不能为空',
      })
    }

    const { username, password } = body

    // 查找用户
    const user = findUserByUsername(username)

    // 用户不存在时返回通用错误（防止用户枚举）
    if (!user) {
      throw createError({
        statusCode: 401,
        message: '用户名或密码错误',
      })
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      throw createError({
        statusCode: 401,
        message: '用户名或密码错误',
      })
    }

    // 创建会话
    const session = createSession({
      username: user.username,
      email: user.email,
    })

    // 设置会话Cookie
    setSessionCookie(event, session.id)

    // 返回成功响应
    return {
      success: true,
      user: {
        username: user.username,
        email: user.email,
      },
    }
  } catch (error: any) {
    // 如果是已创建的错误，直接抛出
    if (error.statusCode) {
      throw error
    }

    // 其他错误
    console.error('[Auth] 登录失败:', error)
    throw createError({
      statusCode: 500,
      message: '登录失败，请稍后重试',
    })
  }
})
