import type { UserConfig, ConfigValidation } from '@/types'

/**
 * 配置管理组合式函数
 * 封装配置读写、校验、持久化逻辑
 */
export const useConfig = () => {
  const configStore = useConfigStore()
  const toast = useToast()
  const router = useRouter()

  // 配置表单数据
  const formData = ref<UserConfig>({
    uid: '',
    token: '',
    openid: '',
    model: '',
    version: '',
    version_name: '',
    wx_version_name: '',
  })

  // 表单错误
  const formErrors = ref<Record<string, string>>({})

  // 是否显示敏感信息
  const showSensitive = ref(false)

  // 保存中状态
  const isSaving = ref(false)

  /**
   * 初始化表单数据
   */
  const initFormData = () => {
    formData.value = { ...configStore.config }
    formErrors.value = {}
  }

  /**
   * 验证表单
   */
  const validateForm = (): boolean => {
    const validation: ConfigValidation = configStore.validateConfig()
    formErrors.value = validation.errors
    return validation.isValid
  }

  /**
   * 保存配置
   */
  const saveConfig = async () => {
    // 先验证
    if (!validateForm()) {
      toast.error('请填写所有必填项')
      return false
    }

    isSaving.value = true

    try {
      // 保存到 store
      configStore.saveConfig(formData.value)
      toast.success('配置保存成功')
      return true
    } catch (error) {
      toast.error('配置保存失败')
      return false
    } finally {
      isSaving.value = false
    }
  }

  /**
   * 重置配置
   */
  const resetConfig = () => {
    configStore.resetConfig()
    initFormData()
    toast.info('配置已重置')
  }

  /**
   * 切换敏感信息显示状态
   */
  const toggleSensitiveDisplay = () => {
    showSensitive.value = !showSensitive.value
  }

  /**
   * 获取显示值（自动处理敏感信息）
   */
  const getDisplayValue = (field: keyof UserConfig): string => {
    const value = formData.value[field] || ''
    const sensitiveFields: (keyof UserConfig)[] = ['token', 'openid']

    if (sensitiveFields.includes(field) && !showSensitive.value) {
      return configStore.maskSensitiveValue(value)
    }

    return value
  }

  /**
   * 检查配置是否完整，如果不完整则跳转到配置页
   */
  const ensureConfigured = (redirectPath?: string): boolean => {
    if (!configStore.isConfigured) {
      toast.warning('请先完成配置')
      router.push({
        path: '/settings',
        query: redirectPath ? { redirect: redirectPath } : undefined,
      })
      return false
    }
    return true
  }

  // 初始化
  onMounted(() => {
    initFormData()
  })

  return {
    formData,
    formErrors,
    showSensitive,
    isSaving,
    isConfigured: computed(() => configStore.isConfigured),
    initFormData,
    validateForm,
    saveConfig,
    resetConfig,
    toggleSensitiveDisplay,
    getDisplayValue,
    ensureConfigured,
  }
}
