/**
 * 账号管理组合式函数
 */

import { ref } from 'vue'

/** 账号记录（列表接口返回的脱敏结构） */
export interface AccountItem {
  id: string
  phone: string
  uin: string
  remark: string
  hasPassword: boolean
  hasToken: boolean
  passwordMask: string
  tokenMask: string
  /** 账号标签 */
  isVerified: boolean
  isNewUser: boolean
  hasOrdered: boolean
  createdAt: string
  updatedAt: string
}

/** 新增 / 更新入参 */
export interface AccountPayload {
  phone: string
  password?: string
  uin?: string
  token?: string
  remark?: string
  isVerified?: boolean
  isNewUser?: boolean
  hasOrdered?: boolean
}

/** 可读取明文的字段 */
export type RevealField = 'password' | 'token'

/** API 响应 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/** 提交结果 */
export interface AccountSubmitResult {
  success: boolean
  error?: string
}

/** 补零 */
const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * 格式化时间（固定格式，避免服务端 / 客户端本地化差异导致水合不一致）
 */
export const formatAccountTime = (input?: string): string => {
  if (!input) {
    return ''
  }
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const datePart =
    date.getFullYear() === now.getFullYear()
      ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const useAccounts = () => {
  const toast = useToast()

  const accounts = ref<AccountItem[]>([])
  const total = ref(0)
  const isLoading = ref(true)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  /** 拉取账号列表 */
  const fetchAccounts = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<{ accounts: AccountItem[]; total: number }>>(
        '/api/accounts/list'
      )
      if (response.success && response.data) {
        accounts.value = response.data.accounts
        total.value = response.data.total
      } else {
        const message = response.error?.message || '加载账号列表失败'
        error.value = message
        toast.error(message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络请求失败'
      error.value = message
      toast.error(message)
    } finally {
      isLoading.value = false
    }
  }

  /** 新增账号 */
  const createAccount = async (payload: AccountPayload): Promise<AccountSubmitResult> => {
    isSubmitting.value = true

    try {
      const response = await $fetch<ApiResponse<{ account: AccountItem }>>('/api/accounts/create', {
        method: 'POST',
        body: payload,
      })

      if (!response.success) {
        return { success: false, error: response.error?.message || '保存失败' }
      }

      await fetchAccounts()
      toast.success('账号已添加')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '网络请求失败' }
    } finally {
      isSubmitting.value = false
    }
  }

  /** 更新账号 */
  const updateAccount = async (
    id: string,
    payload: AccountPayload
  ): Promise<AccountSubmitResult> => {
    isSubmitting.value = true

    try {
      const response = await $fetch<ApiResponse<{ account: AccountItem }>>('/api/accounts/update', {
        method: 'POST',
        body: { id, ...payload },
      })

      if (!response.success) {
        return { success: false, error: response.error?.message || '保存失败' }
      }

      await fetchAccounts()
      toast.success('已保存修改')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '网络请求失败' }
    } finally {
      isSubmitting.value = false
    }
  }

  /** 删除账号 */
  const deleteAccount = async (id: string): Promise<AccountSubmitResult> => {
    try {
      const response = await $fetch<ApiResponse<{ id: string }>>('/api/accounts/delete', {
        method: 'DELETE',
        query: { id },
      })

      if (!response.success) {
        const message = response.error?.message || '删除失败'
        toast.error(message)
        return { success: false, error: message }
      }

      accounts.value = accounts.value.filter(item => item.id !== id)
      total.value = accounts.value.length
      toast.success('账号已删除')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络请求失败'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  /** 读取凭据明文（点「显示」时调用） */
  const revealField = async (id: string, field: RevealField): Promise<string | null> => {
    try {
      const response = await $fetch<ApiResponse<{ field: string; value: string }>>(
        '/api/accounts/reveal',
        {
          method: 'POST',
          body: { id, field },
        }
      )

      if (!response.success) {
        toast.error(response.error?.message || '读取失败')
        return null
      }

      return response.data?.value ?? ''
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '读取失败')
      return null
    }
  }

  return {
    accounts,
    total,
    isLoading,
    isSubmitting,
    error,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    revealField,
  }
}
