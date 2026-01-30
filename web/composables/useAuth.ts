/**
 * 认证相关的组合式函数
 * 
 * 提供登录、登出、获取用户信息等功能的封装
 */

import type { User } from '~/server/types/auth'

/** 认证状态 */
interface AuthState {
  /** 当前用户 */
  user: User | null
  /** 是否已登录 */
  isLoggedIn: boolean
  /** 是否正在加载 */
  isLoading: boolean
  /** 是否已初始化 */
  initialized: boolean
}

export const useAuth = () => {
  // 全局状态（使用 useState 保持跨组件共享）
  const user = useState<User | null>('auth-user', () => null)
  const isLoading = useState<boolean>('auth-loading', () => false)
  // 标记是否已完成初始化检查（避免重复请求和闪烁）
  const initialized = useState<boolean>('auth-initialized', () => false)

  // 计算属性
  const isLoggedIn = computed(() => user.value !== null)

  /**
   * 获取当前用户信息
   * 
   * @returns 用户信息或null
   */
  const fetchUser = async (): Promise<User | null> => {
    try {
      isLoading.value = true
      
      // 服务端渲染时需要传递请求头（包括Cookie）
      const headers = import.meta.server 
        ? useRequestHeaders(['cookie']) 
        : undefined

      const response = await $fetch('/api/auth/me', {
        headers,
      })
      
      if (response.success && response.user) {
        user.value = response.user
        return response.user
      }
      
      user.value = null
      return null
    } catch {
      user.value = null
      return null
    } finally {
      isLoading.value = false
      initialized.value = true
    }
  }

  /**
   * 登录
   * 
   * @param username 用户名
   * @param password 密码
   * @returns 登录结果
   */
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      isLoading.value = true
      const response = await $fetch('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })

      if (response.success && response.user) {
        user.value = response.user
        initialized.value = true
        return { success: true }
      }

      return { success: false, error: '登录失败' }
    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || '登录失败，请稍后重试'
      return { success: false, error: errorMessage }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 登出
   * 
   * @returns 登出结果
   */
  const logout = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      isLoading.value = true
      await $fetch('/api/auth/logout', {
        method: 'POST',
      })

      user.value = null
      return { success: true }
    } catch (error: any) {
      const errorMessage = error.data?.message || error.message || '登出失败'
      return { success: false, error: errorMessage }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 检查是否已登录（仅在未初始化时执行）
   * 
   * @param force 强制重新检查
   * @returns 是否已登录
   */
  const checkAuth = async (force = false): Promise<boolean> => {
    // 如果已初始化且不强制刷新，直接返回当前状态
    if (initialized.value && !force) {
      return isLoggedIn.value
    }

    const currentUser = await fetchUser()
    return currentUser !== null
  }

  /**
   * 重置认证状态（用于登出后清理）
   */
  const resetAuth = () => {
    user.value = null
    initialized.value = false
  }

  return {
    // 状态
    user: readonly(user),
    isLoggedIn,
    isLoading: readonly(isLoading),
    initialized: readonly(initialized),

    // 方法
    fetchUser,
    login,
    logout,
    checkAuth,
    resetAuth,
  }
}
