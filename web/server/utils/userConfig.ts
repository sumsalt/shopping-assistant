/**
 * 用户配置文件读取服务
 * 
 * 提供从配置文件加载用户列表的功能，支持热加载（每次请求时读取最新配置）
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { UsersConfigFile, UserConfig } from '../types/auth'

/** 配置文件路径 */
const CONFIG_PATH = resolve(process.cwd(), 'config/users.json')

/**
 * 读取并解析用户配置文件
 * 
 * @returns 用户配置列表，配置文件不存在或格式错误时返回空数组
 */
export const loadUsersConfig = (): UserConfig[] => {
  try {
    // 检查配置文件是否存在
    if (!existsSync(CONFIG_PATH)) {
      console.error(`[Auth] 用户配置文件不存在: ${CONFIG_PATH}`)
      return []
    }

    // 读取配置文件
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    
    // 解析JSON
    const config: UsersConfigFile = JSON.parse(content)

    // 验证配置格式
    if (!config.users || !Array.isArray(config.users)) {
      console.error('[Auth] 用户配置文件格式错误: users字段必须是数组')
      return []
    }

    // 验证每个用户的必要字段
    const validUsers = config.users.filter((user, index) => {
      if (!user.username || typeof user.username !== 'string') {
        console.error(`[Auth] 用户配置错误: 第${index + 1}个用户缺少username字段`)
        return false
      }
      if (!user.password || typeof user.password !== 'string') {
        console.error(`[Auth] 用户配置错误: 第${index + 1}个用户缺少password字段`)
        return false
      }
      if (!user.email || typeof user.email !== 'string') {
        console.error(`[Auth] 用户配置错误: 第${index + 1}个用户缺少email字段`)
        return false
      }
      return true
    })

    return validUsers
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('[Auth] 用户配置文件JSON格式错误:', error.message)
    } else {
      console.error('[Auth] 读取用户配置文件失败:', error)
    }
    return []
  }
}

/**
 * 根据用户名查找用户
 * 
 * @param username 用户名
 * @returns 用户配置信息，未找到时返回undefined
 */
export const findUserByUsername = (username: string): UserConfig | undefined => {
  const users = loadUsersConfig()
  return users.find(user => user.username === username)
}
