import { defineStore } from 'pinia'
import type { UserConfig, ConfigValidation } from '@/types'

// localStorage 存储键
const STORAGE_KEY = 'shopping-assistant-config'

// 默认配置
const DEFAULT_CONFIG: UserConfig = {
  uid: '',
  token: '',
  openid: '',
  model: 'iPhone 14 Pro<iPhone15,2>',
  version: '8.0.60',
  version_name: '4.9.0',
  wx_version_name: '3.5.34',
  proxyUrl: '',
  proxyEnabled: '0',
}

// 必填字段（uid、token、openid 改为非必须）
const REQUIRED_FIELDS: (keyof UserConfig)[] = []

/**
 * 配置状态管理
 */
export const useConfigStore = defineStore('config', () => {
  // 配置状态
  const config = ref<UserConfig>({ ...DEFAULT_CONFIG })

  // 是否已初始化
  const isInitialized = ref(false)

  // 计算属性：是否已配置完成
  const isConfigured = computed(() => {
    return REQUIRED_FIELDS.every((field) => {
      const value = config.value[field]
      return value && value.trim() !== ''
    })
  })

  /**
   * 从 localStorage 加载配置
   */
  const loadConfig = () => {
    if (import.meta.client) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          config.value = { ...DEFAULT_CONFIG, ...parsed }
        }
      } catch (error) {
        console.error('加载配置失败:', error)
      }
      isInitialized.value = true
    }
  }

  /**
   * 保存配置到 localStorage
   */
  const saveConfig = (newConfig: Partial<UserConfig>) => {
    config.value = { ...config.value, ...newConfig }

    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
      } catch (error) {
        console.error('保存配置失败:', error)
      }
    }
  }

  /**
   * 更新单个配置项
   */
  const updateField = (field: keyof UserConfig, value: string) => {
    config.value[field] = value as any
    saveConfig(config.value)
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
    const errors: Record<string, string> = {}

    // uid、token、openid 改为非必须，不再验证
    // 可根据需要添加其他必填字段的验证

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    }
  }

  /**
   * 获取配置（用于 API 调用）
   */
  const getConfigForApi = (): UserConfig | null => {
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

  // 初始化时加载配置
  if (import.meta.client) {
    loadConfig()
  }

  return {
    config,
    isInitialized,
    isConfigured,
    loadConfig,
    saveConfig,
    updateField,
    resetConfig,
    validateConfig,
    getConfigForApi,
    maskSensitiveValue,
  }
})
