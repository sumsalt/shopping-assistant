/**
 * 自动下单表单的共享逻辑
 *
 * 「价格监控」与「到货监控」两个弹窗的自动下单部分原本各写一遍：
 * 目标价/折扣校验、件数与支付方式、收货地址拉取、规格多选、下单预检。
 * 两处只有「触发方式」和文案不同，逻辑收在这里，弹窗只保留各自的展示。
 */

import {
  toBoolean,
  type AddressItem,
  type PrecheckResult,
  type SkuOption,
} from '@/utils/autoOrder'

/** 提交时需要的下单参数 */
export interface AutoOrderSelection {
  num: number
  payTool: '1' | '4'
  addressId?: string
  skus?: string[]
}

/** 价格触发条件（仅价格监控使用） */
export interface AutoOrderTrigger {
  mode: 'price' | 'discount'
  targetPrice?: number
  targetDiscount?: number
}

export interface AutoOrderFormOptions {
  /** 取商品货号：外部可能只有商品 ID，需要查一次库存接口 */
  resolveProductNo: () => string | Promise<string>
  /** 预检请求里的 goodsId */
  resolveProductId: () => string | undefined
  /** 是否展示「目标价 / 折扣」触发方式（价格监控需要，到货监控不需要） */
  withTrigger?: boolean
  /** 打开弹窗时复位到的购买件数（两种监控弹窗都传 5；不传则默认 1 件） */
  defaultNum?: number
  /** 打开弹窗时是否立刻读规格（到货监控的规格同时也是提醒条件） */
  skusOnOpen?: boolean
}

export const useAutoOrderForm = (options: AutoOrderFormOptions) => {
  const configStore = useConfigStore()
  const toast = useToast()

  /** 件数默认值：限定在 1~99，与服务端 MAX_AUTO_ORDER_NUM 一致 */
  const defaultNum = Math.min(99, Math.max(1, Math.floor(Number(options.defaultNum) || 1)))

  /** 是否已配置登录态（自动下单的前提） */
  const hasCredential = computed(() => Boolean(configStore.activeAccount?.hasCredential))

  // 开关与触发条件
  const enabled = ref(false)
  const mode = ref<'price' | 'discount'>('price')
  const targetPriceInput = ref('')
  const targetPriceError = ref('')
  const targetDiscountInput = ref('')
  const targetDiscountError = ref('')

  // 下单参数（价格监控默认 5 件；到货监控沿用 1 件）
  const num = ref(defaultNum)
  const payTool = ref<'1' | '4'>('4')

  // 收货地址
  const addresses = ref<AddressItem[]>([])
  const addressId = ref('')
  const isLoadingAddress = ref(false)
  const addressError = ref('')

  // 规格
  const skus = ref<SkuOption[]>([])
  const selectedSkus = ref<string[]>([])
  const isLoadingSkus = ref(false)
  const skuError = ref('')

  // 预检
  const isChecking = ref(false)
  const precheck = ref<PrecheckResult | null>(null)

  const ensureProductNo = async (): Promise<string> => String((await options.resolveProductNo()) || '')

  /** 读取规格列表；货号缺失或没有登录态时按「全部规格」处理 */
  const loadSkus = async (productNo?: string) => {
    if (isLoadingSkus.value || !hasCredential.value) {
      return
    }

    const no = productNo || (await ensureProductNo())
    if (!no) {
      return
    }

    isLoadingSkus.value = true
    skuError.value = ''

    try {
      const response = await $fetch<{
        success: boolean
        data?: {
          skuList?: Array<{ skuId: string; color?: string; size?: string; saleStock?: number }>
        }
        error?: { message: string }
      }>(`/api/stock/skus/${no}`)

      if (response.success && response.data?.skuList) {
        skus.value = response.data.skuList.map(item => ({
          skuId: item.skuId,
          label: [item.color, item.size].filter(Boolean).join(' / ') || item.skuId,
          saleStock: item.saleStock ?? 0,
        }))
      } else {
        skuError.value = response.error?.message || '读取规格失败'
      }
    } catch (error) {
      skuError.value = error instanceof Error ? error.message : '读取规格失败'
    } finally {
      isLoadingSkus.value = false
    }
  }

  const loadAddresses = async () => {
    if (!hasCredential.value || isLoadingAddress.value) {
      return
    }

    isLoadingAddress.value = true
    addressError.value = ''

    try {
      const response = await $fetch<{
        success: boolean
        data?: { addresses: AddressItem[] }
        error?: { message: string }
      }>('/api/order/addresses', { method: 'POST' })

      if (response.success && response.data) {
        addresses.value = response.data.addresses
        if (!addressId.value && addresses.value.length > 0) {
          addressId.value = addresses.value[0].addressId
        }
      } else {
        addressError.value = response.error?.message || '读取地址失败'
      }
    } catch (error) {
      addressError.value = error instanceof Error ? error.message : '读取地址失败'
    } finally {
      isLoadingAddress.value = false
    }
  }

  const selectAllSkus = () => {
    selectedSkus.value = skus.value.map(item => item.skuId)
  }

  /** 下单预检：真实走一遍加购 + 结算，但不落单 */
  const handlePrecheck = async () => {
    const no = await ensureProductNo()
    if (!no) {
      toast.warning('缺少商品货号，无法预检')
      return
    }
    if (!hasCredential.value) {
      toast.warning('请先在账号管理中选择带登录态的账号')
      return
    }

    isChecking.value = true
    precheck.value = null

    try {
      const response = await $fetch<{
        success: boolean
        data?: PrecheckResult
        error?: { message: string }
      }>('/api/order/precheck', {
        method: 'POST',
        body: {
          goodsId: options.resolveProductId(),
          goodsNo: no,
          num: Math.max(1, Math.floor(Number(num.value) || 1)),
          addressId: addressId.value || undefined,
          skus: selectedSkus.value,
        },
      })

      if (response.success && response.data) {
        precheck.value = response.data
        if (response.data.success) {
          toast.success('预检通过，可以创建任务')
        }
      } else {
        toast.error(response.error?.message || '预检失败')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预检失败')
    } finally {
      isChecking.value = false
    }
  }

  /** 校验触发条件；不合法时把错误挂到对应输入框并返回 null */
  const validateTrigger = (): AutoOrderTrigger | null => {
    if (mode.value === 'discount') {
      targetDiscountError.value = ''
      const targetDiscount = Number(targetDiscountInput.value)
      if (!Number.isFinite(targetDiscount) || targetDiscount <= 0 || targetDiscount >= 10) {
        targetDiscountError.value = '折扣需大于 0 且小于 10（例如 2.4 表示 2.4 折）'
        return null
      }
      return { mode: 'discount', targetDiscount }
    }

    targetPriceError.value = ''
    const targetPrice = Number(targetPriceInput.value)
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      targetPriceError.value = '请输入大于 0 的目标价'
      return null
    }
    return { mode: 'price', targetPrice }
  }

  /** 提交时取下单参数（未选规格 / 地址时不下发这两个字段） */
  const selection = (): AutoOrderSelection => ({
    num: Math.max(1, Math.floor(Number(num.value) || 1)),
    payTool: payTool.value,
    ...(addressId.value ? { addressId: addressId.value } : {}),
    ...(selectedSkus.value.length > 0 ? { skus: selectedSkus.value } : {}),
  })

  /** 复位到安全默认：不自动下单、件数回到弹窗默认值、微信支付 */
  const reset = () => {
    enabled.value = false
    mode.value = 'price'
    targetPriceInput.value = ''
    targetPriceError.value = ''
    targetDiscountInput.value = ''
    targetDiscountError.value = ''
    num.value = defaultNum
    payTool.value = '4'
    addresses.value = []
    addressId.value = ''
    addressError.value = ''
    skus.value = []
    selectedSkus.value = []
    skuError.value = ''
    precheck.value = null
  }

  /** 打开弹窗时调用：复位并按需预取规格 */
  const open = () => {
    reset()
    if (options.skusOnOpen) {
      void loadSkus()
    }
  }

  /** 换商品时清掉与旧商品相关的数据 */
  const onProductChange = () => {
    precheck.value = null
    selectedSkus.value = []
    skus.value = []
    skuError.value = ''
    if (options.skusOnOpen) {
      void loadSkus()
    }
  }

  // 打开自动下单才去请求一手：地址必拉，规格按 skusOnOpen 决定
  watch(enabled, async value => {
    precheck.value = null
    if (!toBoolean(value) || !hasCredential.value) {
      return
    }

    if (skus.value.length === 0) {
      void loadSkus()
    }
    if (addresses.value.length === 0) {
      void loadAddresses()
    }
  })

  // 刷新后立刻打开开关时账号配置可能还在路上：到齐后补拉一次
  watch(hasCredential, value => {
    if (!value) {
      selectedSkus.value = []
      skus.value = []
      skuError.value = ''
      return
    }

    if (!toBoolean(enabled.value)) {
      return
    }
    if (skus.value.length === 0) {
      void loadSkus()
    }
    if (addresses.value.length === 0) {
      void loadAddresses()
    }
  })

  return {
    hasCredential,
    // 开关与触发方式
    autoOrderEnabled: enabled,
    autoOrderMode: mode,
    targetPriceInput,
    targetPriceError,
    targetDiscountInput,
    targetDiscountError,
    // 下单参数
    num,
    payTool,
    addresses,
    addressId,
    isLoadingAddress,
    addressError,
    skus,
    selectedSkus,
    isLoadingSkus,
    skuError,
    isChecking,
    precheck,
    // 方法
    loadSkus,
    loadAddresses,
    selectAllSkus,
    handlePrecheck,
    validateTrigger,
    selection,
    reset,
    open,
    onProductChange,
  }
}
