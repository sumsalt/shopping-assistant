import { defineStore } from 'pinia'
import type { ApiResponse, ActiveAccountSummary, RuntimeSettings } from '@/types'

/**
 * 运行配置 store
 *
 * 「当前账号」与「代理」都是服务端状态：
 *   - 账号快照（uid/token/udid）只存在服务端，前端这里只有脱敏摘要
 *   - 代理影响服务器出网，同样由服务端保存
 * 因此本地不再持久化任何凭证，也不再由前端组装 adapterConfig。
 */

/** 旧版 localStorage 键，只用于一次性迁移 */
const LEGACY_KEY = 'shopping-assistant-config'

interface ActiveAccountPayload {
  account: {
    id: string
    phone: string
    uin: string
    requestChannel: 'wx' | 'app' | null
    hasRequestProfile: boolean
    hasCredential: boolean
    requestParamCount: number
  } | null
}

/**
 * Nuxt 的 $fetch 会对路由字符串做深度类型推导，在 Pinia store 里会触发
 * 「Excessive stack depth」。这里收敛成普通签名，响应结构由调用方断言。
 */
const request = <T>(
  url: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> => $fetch(url, options as never) as unknown as Promise<T>

const toSummary = (payload: ActiveAccountPayload['account']): ActiveAccountSummary | null =>
  payload
    ? {
        id: payload.id,
        phone: payload.phone,
        uin: payload.uin,
        channel: payload.requestChannel,
        hasCredential: payload.hasCredential,
        hasRequestProfile: payload.hasRequestProfile,
        requestParamCount: payload.requestParamCount,
      }
    : null

export const useConfigStore = defineStore('config', () => {
  const proxyUrl = ref('')
  const proxyEnabled = ref(false)
  const activeAccount = ref<ActiveAccountSummary | null>(null)
  const isLoading = ref(false)
  const isInitialized = ref(false)

  /** 是否已选择当前账号（不要求带登录态） */
  const isConfigured = computed(() => Boolean(activeAccount.value))

  const fetchSettings = async (): Promise<void> => {
    try {
      const response = await request<ApiResponse<RuntimeSettings>>('/api/settings')
      if (response.success && response.data) {
        proxyUrl.value = response.data.proxyUrl || ''
        proxyEnabled.value = Boolean(response.data.proxyEnabled)
      }
    } catch {
      // 未登录或网络异常时保持默认值，页面上的保存动作会给出明确错误
    }
  }

  const fetchActiveAccount = async (): Promise<void> => {
    try {
      const response = await request<ApiResponse<ActiveAccountPayload>>('/api/accounts/active')
      if (response.success && response.data) {
        activeAccount.value = toSummary(response.data.account)
      }
    } catch {
      // 同上
    }
  }

  /**
   * 一次性迁移旧版 localStorage
   *
   * 旧版本把当前账号 id / 完整快照 / 代理都存在浏览器里。改成服务端状态后，
   * 首次打开时把旧值同步到服务端，避免上线后所有人都变回匿名。
   */
  const migrateLegacy = async (): Promise<boolean> => {
    if (!import.meta.client) {
      return false
    }
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) {
      return false
    }

    let legacy: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(raw)
      legacy = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      legacy = null
    }

    const jobs: Promise<unknown>[] = []

    // 代理：服务端还没有配置时，用旧值补上
    if (!proxyUrl.value && typeof legacy?.proxyUrl === 'string' && legacy.proxyUrl) {
      jobs.push(
        request('/api/settings', {
          method: 'POST',
          body: {
            proxyUrl: legacy.proxyUrl,
            proxyEnabled: legacy.proxyEnabled === '1',
          },
        })
      )
    }

    // 当前账号：服务端没有选择时，沿用浏览器里记着的那一个
    if (!activeAccount.value && typeof legacy?.activeAccountId === 'string' && legacy.activeAccountId) {
      jobs.push(
        request('/api/accounts/active', {
          method: 'POST',
          body: { id: legacy.activeAccountId },
        })
      )
    }

    if (jobs.length > 0) {
      await Promise.allSettled(jobs)
    }
    // 迁移完就删掉旧键：里面可能还有明文快照
    localStorage.removeItem(LEGACY_KEY)

    return jobs.length > 0
  }

  /**
   * 拉取服务端状态（幂等）
   *
   * 直接刷新 /stock/xxx 这类页时，页面的首个请求常常早于启动插件的拉取完成。
   * 这里必须让并发调用「等同一份结果」，而不是直接返回：
   * 否则读 activeAccount 的一方会拿到空值，误判成「没有登录态」。
   */
  let pendingLoad: Promise<void> | null = null

  const load = async (force = false): Promise<void> => {
    if (!import.meta.client) {
      return
    }
    if (pendingLoad) {
      await pendingLoad
      return
    }
    if (isInitialized.value && !force) {
      return
    }

    pendingLoad = (async () => {
      isLoading.value = true
      try {
        await Promise.all([fetchSettings(), fetchActiveAccount()])
        const migrated = await migrateLegacy()
        if (migrated) {
          await Promise.all([fetchSettings(), fetchActiveAccount()])
        }
        isInitialized.value = true
      } finally {
        isLoading.value = false
      }
    })()

    try {
      await pendingLoad
    } finally {
      pendingLoad = null
    }
  }

  /** 设置 / 清除当前账号（服务端） */
  const setActiveAccount = async (id: string | null): Promise<boolean> => {
    try {
      const response = await request<ApiResponse<ActiveAccountPayload>>('/api/accounts/active', {
        method: 'POST',
        body: { id },
      })
      if (!response.success) {
        return false
      }
      activeAccount.value = toSummary(response.data?.account ?? null)
      return true
    } catch {
      return false
    }
  }

  const clearActiveAccount = async (): Promise<boolean> => setActiveAccount(null)

  /** 清空内存状态（登出时调用，避免下一个登录用户看到上一个账号的摘要） */
  const reset = (): void => {
    proxyUrl.value = ''
    proxyEnabled.value = false
    activeAccount.value = null
    isInitialized.value = false
  }

  /** 保存运行设置（代理） */
  const saveSettings = async (input: {
    proxyUrl: string
    proxyEnabled: boolean
  }): Promise<boolean> => {
    try {
      const response = await request<ApiResponse<RuntimeSettings>>('/api/settings', {
        method: 'POST',
        body: input,
      })
      if (!response.success || !response.data) {
        return false
      }
      proxyUrl.value = response.data.proxyUrl || ''
      proxyEnabled.value = Boolean(response.data.proxyEnabled)
      return true
    } catch {
      return false
    }
  }

  return {
    proxyUrl,
    proxyEnabled,
    activeAccount,
    isLoading,
    isInitialized,
    isConfigured,
    load,
    fetchSettings,
    fetchActiveAccount,
    setActiveAccount,
    clearActiveAccount,
    saveSettings,
    reset,
  }
})
