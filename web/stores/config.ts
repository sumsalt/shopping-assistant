import { defineStore } from 'pinia'
import type { UserConfig, ConfigValidation, RequestProfile } from '@/types'

// localStorage 存储键
const STORAGE_KEY = 'shopping-assistant-config'

/**
 * 默认配置
 *
 * 设备 / 登录信息已迁到「账号管理」：这里只记当前选用的账号及其请求快照，
 * 加上全局代理设置。未选账号时所有请求回退到旧的默认 wx 匿名参数。
 */
const DEFAULT_CONFIG: UserConfig = {
  activeAccountId: '',
  activeAccountPhone: '',
  activeAccountUin: '',
  activeAccountChannel: null,
  activeAccountProfile: null,
  proxyUrl: '',
  proxyEnabled: '0',
}

/** 允许持久化的字段白名单（用于丢弃旧版 localStorage 里残留的 uid/token 等） */
const CONFIG_KEYS: (keyof UserConfig)[] = [
  'activeAccountId',
  'activeAccountPhone',
  'activeAccountUin',
  'activeAccountChannel',
  'activeAccountProfile',
  'proxyUrl',
  'proxyEnabled',
]

/** 必填字段：全部可选，配置永远「已完成」（保留 isConfigured 供布局展示） */
const REQUIRED_FIELDS: (keyof UserConfig)[] = []

/** 校验缓存的请求快照，脏数据当作未选账号 */
const sanitizeProfile = (raw: unknown): RequestProfile | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const obj = raw as Record<string, unknown>
  if (obj.channel !== 'wx' && obj.channel !== 'app') {
    return null
  }
  const isStringMap = (value: unknown): value is Record<string, string> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(item => typeof item === 'string')
  if (!isStringMap(obj.params) || !isStringMap(obj.headers)) {
    return null
  }
  return {
    channel: obj.channel,
    params: obj.params,
    headers: obj.headers,
    ...(typeof obj.path === 'string' ? { path: obj.path } : {}),
  }
}

/** 读取存储时只保留白名单字段，顺手清掉旧版遗留的明文 uid/token */
const sanitizeConfig = (raw: unknown): UserConfig => {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const result: UserConfig = { ...DEFAULT_CONFIG }
  for (const key of CONFIG_KEYS) {
    const value = obj[key]
    if (value === undefined) {
      continue
    }
    if (key === 'activeAccountProfile') {
      result.activeAccountProfile = sanitizeProfile(value)
    } else if (key === 'activeAccountChannel') {
      result.activeAccountChannel = value === 'wx' || value === 'app' ? value : null
    } else if (typeof value === 'string') {
      ;(result as unknown as Record<string, unknown>)[key] = value
    }
  }
  return result
}

/**
 * 配置状态管理
 */
export const useConfigStore = defineStore('config', () => {
  // 配置状态
  const config = ref<UserConfig>({ ...DEFAULT_CONFIG })

  // 是否已初始化
  const isInitialized = ref(false)

  // 计算属性：是否已配置完成（所有字段均可选，始终为 true）
  const isConfigured = computed(() => {
    return REQUIRED_FIELDS.every((field) => {
      const value = config.value[field]
      return typeof value === 'string' ? value.trim() !== '' : Boolean(value)
    })
  })

  /**
   * 客户端惰性补读
   *
   * Nuxt SSR 水合时，Pinia 会用服务端序列化的空 state 覆盖客户端启动阶段
   * loadConfig() 读到的 localStorage 值。因此每次读配置前都确认一次；
   * 服务端 state 里 isInitialized 恒为 false， hydration 后首次读取会补读回来。
   */
  const ensureLoaded = () => {
    if (import.meta.client && !isInitialized.value) {
      loadConfig()
    }
  }

  /** 当前账号摘要（供页面展示） */
  const activeAccount = computed(() => {
    ensureLoaded()
    return {
      id: config.value.activeAccountId || '',
      phone: config.value.activeAccountPhone || '',
      uin: config.value.activeAccountUin || '',
      channel: config.value.activeAccountChannel ?? null,
      profile: config.value.activeAccountProfile ?? null,
    }
  })

  /**
   * 从 localStorage 加载配置
   */
  const loadConfig = () => {
    if (import.meta.client) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        config.value = stored ? sanitizeConfig(JSON.parse(stored)) : { ...DEFAULT_CONFIG }
      } catch (error) {
        console.error('加载配置失败:', error)
        config.value = { ...DEFAULT_CONFIG }
      }
      isInitialized.value = true
    }
  }

  /** 写回 localStorage（清理后的对象，不会带上旧字段） */
  const persist = () => {
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeConfig(config.value)))
      } catch (error) {
        console.error('保存配置失败:', error)
      }
    }
  }

  /**
   * 保存配置到 localStorage
   */
  const saveConfig = (newConfig: Partial<UserConfig>) => {
    config.value = sanitizeConfig({ ...config.value, ...newConfig })
    persist()
  }

  /**
   * 更新单个配置项
   */
  const updateField = (field: keyof UserConfig, value: string) => {
    ;(config.value as unknown as Record<string, unknown>)[field] = value
    config.value = sanitizeConfig(config.value)
    persist()
  }

  /** 选中一个账号作为当前使用账号（含完整请求快照） */
  const setActiveAccount = (account: {
    id: string
    phone: string
    uin: string
    channel: RequestProfile['channel'] | null
    profile: RequestProfile | null
  }) => {
    saveConfig({
      activeAccountId: account.id,
      activeAccountPhone: account.phone,
      activeAccountUin: account.uin,
      activeAccountChannel: account.channel,
      activeAccountProfile: account.profile,
    })
  }

  /** 取消当前账号，回到匿名默认参数 */
  const clearActiveAccount = () => {
    saveConfig({
      activeAccountId: '',
      activeAccountPhone: '',
      activeAccountUin: '',
      activeAccountChannel: null,
      activeAccountProfile: null,
    })
  }

  /**
   * 重置配置为默认值
   */
  const resetConfig = () => {
    config.value = { ...DEFAULT_CONFIG }
    if (import.meta.client) {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  /**
   * 验证配置
   */
  const validateConfig = (): ConfigValidation => {
    return { isValid: true, errors: {} }
  }

  /**
   * 获取配置（用于 API 调用）
   */
  const getConfigForApi = (): UserConfig | null => {
    // 兜底：直接打开详情页 / SSR 水合后，同步补读一次，避免带着空的账号快照发请求
    ensureLoaded()

    if (!isConfigured.value) {
      return null
    }
    return { ...config.value }
  }

  /**
   * 隐藏敏感信息（用于展示）
   */
  const maskSensitiveValue = (value: string, visibleChars: number = 4): string => {
    if (!value || value.length <= visibleChars) {
      return value
    }
    const visible = value.slice(0, visibleChars)
    const masked = '*'.repeat(Math.min(value.length - visibleChars, 10))
    return `${visible}${masked}`
  }

  // 配置存在 localStorage，必须在任何页面发请求前就读到。
  // 之前放在 onMounted 里，但 layout（父组件）的 mounted 晚于子页面，
  // 直接打开 /stock/xxx 这类页面时首个请求会拿到空快照，一手接口返回「请登录」。
  // 这里改为 store 创建时同步加载；loadConfig 内部自带 import.meta.client 判断，SSR 下为空操作
  loadConfig()

  return {
    config,
    isInitialized,
    isConfigured,
    activeAccount,
    loadConfig,
    saveConfig,
    updateField,
    setActiveAccount,
    clearActiveAccount,
    resetConfig,
    validateConfig,
    getConfigForApi,
    maskSensitiveValue,
  }
})
