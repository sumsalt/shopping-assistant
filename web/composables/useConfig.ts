import type { UserConfig, ConfigValidation, RequestProfile, RequestChannel } from '@/types'

/**
 * 配置管理组合式函数
 *
 * 设备 / 登录信息已迁到「账号管理」，这里只负责两件事：
 * 1. 从账号列表选一个账号作为「当前使用账号」（取回完整明文抓包快照并缓存）
 * 2. 编辑全局代理设置
 */

/** 账号下拉项（列表接口返回的脱敏结构，只取需要的字段） */
interface AccountOption {
  id: string
  phone: string
  uin: string
  hasRequestProfile: boolean
  requestChannel: RequestChannel | null
  requestParamCount: number
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

interface ProfileResponse {
  id: string
  phone: string
  uin: string
  requestProfile: RequestProfile | null
}

export const useConfig = () => {
  const configStore = useConfigStore()
  const toast = useToast()
  const router = useRouter()

  // 表单只保留代理设置
  const formData = ref<Pick<UserConfig, 'proxyUrl' | 'proxyEnabled'>>({
    proxyUrl: '',
    proxyEnabled: '0',
  })

  const formErrors = ref<Record<string, string>>({})
  const isSaving = ref(false)

  // 当前账号选择
  const accountList = ref<AccountOption[]>([])
  const selectedAccountId = ref('')
  const isLoadingAccounts = ref(false)
  const isSwitchingAccount = ref(false)

  const activeAccount = computed(() => configStore.activeAccount)

  /** 初始化表单 */
  const initFormData = () => {
    formData.value = {
      proxyUrl: configStore.config.proxyUrl || '',
      proxyEnabled: configStore.config.proxyEnabled || '0',
    }
    formErrors.value = {}
    selectedAccountId.value = configStore.activeAccount.id || ''
  }

  /** 拉取可选账号 */
  const fetchAccounts = async (): Promise<void> => {
    isLoadingAccounts.value = true
    try {
      const response = await $fetch<ApiResponse<{ accounts: AccountOption[] }>>('/api/accounts/list')
      if (response.success && response.data) {
        accountList.value = response.data.accounts
      } else {
        toast.error(response.error?.message || '加载账号列表失败')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载账号列表失败')
    } finally {
      isLoadingAccounts.value = false
    }
  }

  /**
   * 把选中的账号设为当前账号
   *
   * 列表接口只给脱敏副本，这里按 id 单独取回完整明文快照，缓存到 config store。
   * 没有抓包快照的账号也可以选，只是发请求时会回退到默认匿名参数。
   */
  const selectAccount = async (): Promise<void> => {
    const id = selectedAccountId.value
    if (!id) {
      configStore.clearActiveAccount()
      toast.success('已恢复匿名模式')
      return
    }

    isSwitchingAccount.value = true
    try {
      const response = await $fetch<ApiResponse<ProfileResponse>>('/api/accounts/profile', {
        method: 'POST',
        body: { id },
      })

      if (!response.success || !response.data) {
        toast.error(response.error?.message || '读取账号信息失败')
        return
      }

      const profile = response.data.requestProfile
      configStore.setActiveAccount({
        id: response.data.id,
        phone: response.data.phone,
        uin: response.data.uin,
        channel: profile?.channel ?? null,
        profile,
      })

      if (!profile) {
        toast.warning('该账号还没有抓包信息，已设为当前账号，但请求仍走默认匿名参数')
      } else {
        toast.success('已切换当前账号')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '切换账号失败')
    } finally {
      isSwitchingAccount.value = false
    }
  }

  /** 取消选择，回到匿名模式 */
  const clearActiveAccount = () => {
    selectedAccountId.value = ''
    configStore.clearActiveAccount()
    toast.info('已恢复匿名模式')
  }

  /** 验证表单（当前没有必填项） */
  const validateForm = (): boolean => {
    const validation: ConfigValidation = configStore.validateConfig()
    formErrors.value = validation.errors
    return validation.isValid
  }

  /** 保存代理设置（不会覆盖已选账号） */
  const saveConfig = async (): Promise<boolean> => {
    if (!validateForm()) {
      toast.error('请检查配置')
      return false
    }

    isSaving.value = true
    try {
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

  /** 重置配置 */
  const resetConfig = () => {
    configStore.resetConfig()
    initFormData()
    toast.info('配置已重置')
  }

  /** 检查配置是否完整（保留给其它页面调用） */
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

  // 表单初值统一在 onMounted 里同步：当前账号存在 localStorage，
  // SSR 阶段读不到，若在这里就初始化会造成客户端水合不一致
  if (import.meta.client) {
    onMounted(() => {
      // SSR 水合会用服务端空 state 覆盖 localStorage 值，这里显式补读一次
      configStore.loadConfig()
      initFormData()
      fetchAccounts()
    })
  }

  return {
    formData,
    formErrors,
    isSaving,
    accountList,
    selectedAccountId,
    isLoadingAccounts,
    isSwitchingAccount,
    activeAccount,
    isConfigured: computed(() => configStore.isConfigured),
    initFormData,
    fetchAccounts,
    selectAccount,
    clearActiveAccount,
    validateForm,
    saveConfig,
    resetConfig,
    ensureConfigured,
  }
}
