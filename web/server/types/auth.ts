/**
 * 认证相关类型定义
 */

/**
 * 配置文件中的用户信息（包含哈希密码）
 */
export interface UserConfig {
  /** 用户名（唯一） */
  username: string
  /** 密码（bcrypt哈希） */
  password: string
  /** 邮箱地址 */
  email: string
}

/**
 * 用户配置文件结构
 */
export interface UsersConfigFile {
  users: UserConfig[]
}

/**
 * 前端显示的用户信息（不含密码）
 */
export interface User {
  /** 用户名 */
  username: string
  /** 邮箱地址 */
  email: string
}

/**
 * 会话数据结构
 */
export interface Session {
  /** 会话ID */
  id: string
  /** 用户名 */
  username: string
  /** 用户邮箱 */
  email: string
  /** 创建时间（时间戳） */
  createdAt: number
  /** 过期时间（时间戳） */
  expiresAt: number
}

/**
 * 登录请求参数
 */
export interface LoginRequest {
  /** 用户名 */
  username: string
  /** 密码（明文） */
  password: string
}

/**
 * 登录响应数据
 */
export interface LoginResponse {
  /** 是否成功 */
  success: boolean
  /** 用户信息（成功时返回） */
  user?: User
  /** 错误信息（失败时返回） */
  message?: string
}

/**
 * 认证错误响应
 */
export interface AuthError {
  code: number
  message: string
}
