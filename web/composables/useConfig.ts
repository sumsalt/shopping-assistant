import type { ApiResponse, ActiveAccountSummary } from '@/types'
import { accountDisplayName } from '@/utils/accountName'

/**
 * 系统配置组合式函数
 *
 * 当前账号与代理都保存在服务端：
 *   - 选账号只提交账号 id，服务端标记 is_active，后续请求自动使用
 *   - 代理写入服务端运行设置，影响的是服务器出网
 * 前端不再持有或回传抓包参数。
 */

/** 账号下拉项（列表接口返回的脱敏结构） */
interface AccountOption {
  id: string
  phone: string
  uin: string
  hasRequestProfile: boolean
  requestChannel: 'wx' | 'app' | null
  requestParamCount: number
}

export const useConfig = () => {
  const configStore = useConfigStore()
  const toast = useToast()
  const router = useRouter()

  const formData = ref<{ proxyUrl: string; proxyEnabled: boolean }>({
    proxyUrl: '',
    proxyEnabled: false,
  })

  const formErrors = ref<Record<string, string>>({})
  const isSaving = ref(false)
  const isResetting = ref(false)

  const accountList = ref<AccountOption[]>([])
  const selectedAccountId = ref('')
  const isLoadingAccounts = ref(false)
  const isSwitchingAccount = ref(false)

  const activeAccount = computed(() => configStore.activeAccount)

  /** 用服务端状态初始化表单 */
  const initFormData = () => {
    formData.value = {
      proxyUrl: configStore.proxyUrl || '',
      proxyEnabled: Boolean(configStore.proxyEnabled),
    }
    formErrors.value = {}
    selectedAccountId.value = configStore.activeAccount?.id || ''
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
   * 只提交 id；账号快照留在服务端，不再取回浏览器。
   */
  const selectAccount = async (): Promise<void> => {
    const id = selectedAccountId.value
    isSwitchingAccount.value = true
    try {
      const ok = await configStore.setActiveAccount(id || null)
      if (!ok) {
        toast.error('切换当前账号失败')
        return
      }

      if (!id) {
        toast.success('已恢复匿名模式')
        return
      }

      const current: ActiveAccountSummary | null = configStore.activeAccount
      if (current && !current.hasRequestProfile) {
        toast.warning('该账号还没有抓包信息，请求仍走默认匿名参数')
      } else if (current && !current.hasCredential) {
        toast.warning('该账号的抓包缺少 uid/token，只能用于库存查询与 Tab 监控')
      } else {
        toast.success(`已切换为「${current ? accountDisplayName(current) : id}」`)
      }
    } finally {
      isSwitchingAccount.value = false
    }
  }

  /** 取消选择，回到匿名模式 */
  const clearActiveAccount = async (): Promise<void> => {
    selectedAccountId.value = ''
    const ok = await configStore.clearActiveAccount()
    if (ok) {
      toast.info('已恢复匿名模式')
    } else {
      toast.error('操作失败，请重试')
    }
  }

  /** 保存代理设置 */
  const saveConfig = async (): Promise<boolean> => {
    isSaving.value = true
    try {
      const ok = await configStore.saveSettings({
        proxyUrl: formData.value.proxyUrl.trim(),
        proxyEnabled: Boolean(formData.value.proxyEnabled),
      })
      if (!ok) {
        toast.error('配置保存失败')
        return false
      }
      toast.success('配置保存成功')
      return true
    } finally {
      isSaving.value = false
    }
  }

  /** 重置：清除代理与当前账号 */
  const resetConfig = async (): Promise<void> => {
    isResetting.value = true
    try {
      await configStore.saveSettings({ proxyUrl: '', proxyEnabled: false })
      await configStore.clearActiveAccount()
      initFormData()
      toast.info('配置已重置')
    } finally {
      isResetting.value = false
    }
  }

  /** 检查是否已选择当前账号 */
  const ensureConfigured = (redirectPath?: string): boolean => {
    if (!configStore.isConfigured) {
      toast.warning('请先选择当前账号')
      router.push({
        path: '/settings',
        query: redirectPath ? { redirect: redirectPath } : undefined,
      })
      return false
    }
    return true
  }

  // 挂载后再读服务端状态：SSR 阶段拿不到会话对应的账号
  if (import.meta.client) {
    onMounted(async () => {
      await configStore.load()
      initFormData()
      fetchAccounts()
    })
  }

  return {
    formData,
    formErrors,
    isSaving,
    isResetting,
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
    saveConfig,
    resetConfig,
    ensureConfigured,
  }
}
