<template>
  <UiDialog
    :open="open"
    title="价格监控"
    @update:open="handleOpenChange"
  >
    <!-- 设置参数 -->
    <div class="space-y-5">
      <!-- 商品摘要（一个任务只监控一个商品） -->
      <div v-if="displayProduct" class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
        <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
          <img
            v-if="displayProduct.productImage"
            :src="displayProduct.productImage"
            :alt="displayProduct.productName"
            class="w-full h-full object-cover"
          >
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 truncate">
            {{ displayProduct.productName || displayProduct.productId }}
          </p>
          <p class="text-xs text-gray-500">ID：{{ displayProduct.productId }}</p>
        </div>
      </div>

      <!-- 登录态提示 -->
      <div
        v-if="!hasCredential"
        class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
      >
        价格监控只监控登录态下的拿货价，请先在
        <NuxtLink to="/accounts" class="underline font-medium">账号管理</NuxtLink>
        中选择带登录态的账号并设为当前账号。
      </div>

      <!-- 检测间隔 -->
      <UiInput
        v-model="intervalInput"
        type="number"
        label="检测间隔（秒）"
        hint="轮次间隔，最低 60 秒"
        :error="intervalError"
        :disabled="isLoading"
      />

      <!-- 监控时长 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">监控时长</label>
        <select
          v-model="duration"
          :disabled="isLoading"
          class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option :value="3600">1 小时</option>
          <option :value="7200">2 小时</option>
          <option :value="21600">6 小时</option>
          <option :value="43200">12 小时</option>
          <option :value="86400">24 小时</option>
          <option :value="172800">48 小时</option>
          <option :value="259200">72 小时</option>
        </select>
      </div>

      <!-- 通知条件 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">通知条件</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="option in notifyOptions"
            :key="option.value"
            type="button"
            :disabled="isLoading"
            :class="[
              'px-2 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap',
              notifyOn === option.value
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            ]"
            @click="notifyOn = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- 最小变动 -->
      <UiInput
        v-model="minPriceDeltaInput"
        type="number"
        label="最小变动金额（元）"
        hint="低于该金额的变动不通知"
        :disabled="isLoading"
      />

      <!-- 价格到点自动下单 -->
      <div
        class="rounded-lg border p-3 transition-colors"
        :class="autoOrderEnabled ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200'"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900">价格到点自动下单</p>
            <p class="mt-0.5 text-xs text-gray-500">
              拿货价低于或等于目标价时自动创建待付款订单，否则只发邮件提醒
            </p>
          </div>
          <UiSwitch
            :model-value="autoOrderEnabled"
            @update:model-value="(v) => (autoOrderEnabled = toBoolean(v))"
          />
        </div>
      </div>

      <template v-if="autoOrderEnabled">
        <div
          v-if="!hasCredential"
          class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
        >
          自动下单必须使用登录态，请先在
          <NuxtLink to="/accounts" class="underline font-medium">账号管理</NuxtLink>
          中选择带登录态的账号并设为当前账号。也可以关掉开关，只做价格提醒。
        </div>

        <template v-else>
          <UiInput
            v-model="targetPriceInput"
            type="number"
            label="目标价（元）"
            hint="拿货价低于或等于该价格时自动下单"
            :error="targetPriceError"
            :disabled="isLoading"
          />

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">购买件数</label>
              <input
                v-model.number="num"
                type="number"
                min="1"
                max="99"
                :disabled="isLoading"
                class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
              <p class="mt-1 text-xs text-gray-500">库存不足时按实际可买数量下单；多个规格都有货时合并成一单</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">支付方式</label>
              <select
                v-model="payTool"
                :disabled="isLoading"
                class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="4">微信</option>
                <option value="1">支付宝</option>
              </select>
            </div>
          </div>

          <!-- 收货地址 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              收货地址
              <button
                type="button"
                class="ml-2 text-xs text-blue-600 hover:underline"
                :disabled="isLoadingAddress"
                @click="loadAddresses"
              >
                {{ isLoadingAddress ? '加载中…' : '刷新' }}
              </button>
            </label>
            <select
              v-if="addresses.length > 0"
              v-model="addressId"
              :disabled="isLoading"
              class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option v-for="item in addresses" :key="item.addressId" :value="item.addressId">
                {{ item.consignee }} {{ maskMobile(item.mobile) }} · {{ item.area }} {{ item.address }}
              </option>
            </select>
            <p v-else class="text-xs text-gray-500 py-2">
              {{ addressError || '暂未读取到地址，将使用一手账号默认地址' }}
            </p>
          </div>

          <!-- 规格 -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-700">指定规格</label>
              <div v-if="skus.length > 0" class="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  class="text-blue-600 hover:underline"
                  @click="selectAllSkus"
                >
                  全选
                </button>
                <button
                  type="button"
                  class="text-gray-500 hover:underline"
                  :disabled="selectedSkus.length === 0"
                  @click="selectedSkus = []"
                >
                  清空
                </button>
              </div>
            </div>

            <div v-if="isLoadingSkus" class="py-2 text-xs text-gray-500">加载规格中…</div>
            <div v-else-if="skuError" class="py-2 text-xs text-amber-600">
              {{ skuError }}（将下单全部规格）
            </div>
            <div v-else-if="skus.length === 0" class="py-2 text-xs text-gray-500">
              暂未读取到规格，将下单全部有货规格
            </div>
            <div
              v-else
              class="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100"
            >
              <label
                v-for="sku in skus"
                :key="sku.skuId"
                class="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
              >
                <input
                  v-model="selectedSkus"
                  type="checkbox"
                  :value="sku.skuId"
                  class="rounded border-gray-300"
                >
                <span class="text-gray-800">{{ sku.label }}</span>
                <span
                  class="ml-auto text-xs"
                  :class="sku.saleStock > 0 ? 'text-green-600' : 'text-gray-400'"
                >
                  {{ sku.saleStock > 0 ? `有货 ${sku.saleStock}` : '无货' }}
                </span>
              </label>
            </div>

            <p v-if="selectedSkus.length > 0" class="mt-1 text-xs text-blue-600">
              只在选中的 {{ selectedSkus.length }} 个规格里下单，多个规格有货会合并成一单
            </p>
          </div>

          <!-- 预检结果 -->
          <div
            v-if="precheck"
            class="p-3 rounded-lg text-sm"
            :class="precheck.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'"
          >
            <template v-if="precheck.success">
              <p class="font-medium">
                链路可用：<template v-if="precheck.items?.length">{{ precheck.items.map(item => `${item.skuLabel} × ${item.num}`).join('、') }}</template><template v-else>{{ precheck.skuLabel }} × {{ precheck.num }}</template>
              </p>
              <p v-if="precheck.numReduced" class="mt-1 text-xs">
                当前库存只有 {{ precheck.num }} 件，将按实际可买数量下单（你设置的是 {{ precheck.requestedNum }} 件）
              </p>
              <p class="mt-1">
                商品 ¥{{ precheck.goodsAmount?.toFixed(2) ?? '-' }} + 运费 ¥{{ precheck.shippingFee?.toFixed(2) ?? '-' }}
              </p>
              <p class="mt-1 text-xs">购物车已清理，未生成订单</p>
            </template>
            <template v-else>
              <p class="font-medium">预检失败（{{ precheck.stage ? stageText(precheck.stage) : '未知环节' }}）</p>
              <p class="mt-1">{{ precheck.message }}</p>
            </template>
          </div>
        </template>
      </template>

      <!-- 预计周期 -->
      <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        预计每轮检测耗时：{{ cycleText }}
        <p class="mt-1 text-xs text-blue-600">
          轮次间隔在每次检测结束后再计算，实际节奏还受全局请求闸门限制（登录态约 15 秒一次请求）
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2">
        <UiButton
          variant="outline"
          class="flex-1 whitespace-nowrap"
          :disabled="isLoading"
          @click="handleClose"
        >
          取消
        </UiButton>
        <UiButton
          v-if="autoOrderEnabled && hasCredential"
          variant="outline"
          class="flex-1 whitespace-nowrap"
          :loading="isChecking"
          :disabled="isLoading || isChecking || !productNo"
          @click="handlePrecheck"
        >
          预检
        </UiButton>
        <UiButton
          variant="primary"
          class="flex-1 whitespace-nowrap"
          :loading="isLoading"
          :disabled="isLoading || !hasCredential || (autoOrderEnabled && !productNo)"
          @click="handleSubmit"
        >
          {{ isLoading ? '创建中' : '开始监控' }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import {
  MIN_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_DURATION,
  type PriceMonitorProduct,
  type PriceAutoOrderOptions,
  type PriceNotifyOn,
} from '~/composables/usePriceMonitor'

interface AddressItem {
  addressId: string
  consignee: string
  mobile: string
  area: string
  address: string
  province: string
  city: string
  district: string
}

interface PrecheckResult {
  success: boolean
  message?: string
  skuLabel?: string
  items?: Array<{ sku: string; skuLabel: string; num: number }>
  num?: number
  requestedNum?: number
  numReduced?: boolean
  goodsAmount?: number
  shippingFee?: number
  stage?: string
}

interface SkuOption {
  skuId: string
  label: string
  saleStock: number
}

// 组件属性
interface Props {
  open: boolean
  /** 要监控的商品，只能从商品详情页打开 */
  product?: PriceMonitorProduct | null
}

const props = withDefaults(defineProps<Props>(), {
  product: null,
})

// 定义事件
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [taskId: string]
}>()

const configStore = useConfigStore()
const toast = useToast()
const { createPriceMonitorTask, isLoading } = usePriceMonitor()
const { checkStock } = useStock()

// 检测间隔
const intervalInput = ref(String(MIN_PRICE_MONITOR_INTERVAL))
// 监控时长（默认 24 小时）
const duration = ref(DEFAULT_PRICE_MONITOR_DURATION)
// 通知条件
const notifyOn = ref<PriceNotifyOn>('any')
// 最小变动金额
const minPriceDeltaInput = ref('0.01')

const intervalError = ref('')

// 价格到点自动下单
const autoOrderEnabled = ref(false)
const targetPriceInput = ref('')
const targetPriceError = ref('')
const num = ref(1)
const payTool = ref<'1' | '4'>('4')
const productNo = ref('')
const addresses = ref<AddressItem[]>([])
const addressId = ref('')
const isLoadingAddress = ref(false)
const addressError = ref('')
const skus = ref<SkuOption[]>([])
const selectedSkus = ref<string[]>([])
const isLoadingSkus = ref(false)
const skuError = ref('')
const isChecking = ref(false)
const precheck = ref<PrecheckResult | null>(null)

const toBoolean = (value: boolean | '1' | '0'): boolean => value === true || value === '1'

const stageText = (stage: string): string => {
  const map: Record<string, string> = {
    address: '收货地址',
    sku: '查询规格',
    cart: '加入购物车',
    confirm: '结算确认',
    create: '创建订单',
  }
  return map[stage] || stage
}

const maskMobile = (mobile: string): string =>
  mobile ? mobile.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''

/**
 * 取商品货号
 *
 * 下单链路要用货号查 SKU。外部传入的商品可能只有 ID，这里按需查一次。
 */
const ensureProductNo = async (): Promise<string> => {
  if (productNo.value) {
    return productNo.value
  }
  if (props.product?.productNo) {
    productNo.value = props.product.productNo
    return productNo.value
  }

  const productId = displayProduct.value?.productId
  if (!productId) {
    return ''
  }

  const result = await checkStock(productId)
  productNo.value = result?.productNo || ''
  return productNo.value
}

/** 读取规格列表（下单用，价格监控本身不需要） */
const loadSkus = async (no: string) => {
  if (!no || isLoadingSkus.value) {
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

const selectAllSkus = () => {
  selectedSkus.value = skus.value.map(item => item.skuId)
}

const loadAddresses = async () => {
  if (!hasCredential.value) {
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

const handlePrecheck = async () => {
  const no = await ensureProductNo()
  if (!no) {
    toast.warning('缺少商品货号，无法预检')
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
        goodsId: displayProduct.value?.productId,
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

const notifyOptions: Array<{ value: PriceNotifyOn; label: string }> = [
  { value: 'any', label: '涨跌都通知' },
  { value: 'drop', label: '仅降价' },
  { value: 'rise', label: '仅涨价' },
]

// 实际要监控的商品（一个任务只监控一个商品）
const displayProduct = computed(() => props.product)

// 是否已配置登录态（当前账号的抓包快照里带 uid + token）
const hasCredential = computed(() => Boolean(configStore.activeAccount?.hasCredential))

// 预计检测周期
const cycleText = computed(() => {
  const interval = Number(intervalInput.value) || DEFAULT_PRICE_MONITOR_INTERVAL
  return `约 ${interval} 秒/次`
})

// 关闭弹窗
const handleClose = () => {
  emit('update:open', false)
}

// 外部控制开关
const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

// 提交
const handleSubmit = async () => {
  intervalError.value = ''

  const interval = Number(intervalInput.value)
  if (!Number.isFinite(interval) || interval < MIN_PRICE_MONITOR_INTERVAL) {
    intervalError.value = `检测间隔不能小于 ${MIN_PRICE_MONITOR_INTERVAL} 秒`
    return
  }

  if (!displayProduct.value) {
    toast.warning('缺少商品信息，请从商品详情页重新打开')
    return
  }

  const minPriceDelta = Number(minPriceDeltaInput.value)

  targetPriceError.value = ''

  /** 价格到点自动下单配置 */
  let autoOrder: PriceAutoOrderOptions | undefined

  if (autoOrderEnabled.value) {
    const targetPrice = Number(targetPriceInput.value)

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      targetPriceError.value = '请输入大于 0 的目标价'
      return
    }

    if (!hasCredential.value) {
      toast.warning('自动下单需要一手登录态，请先在账号管理中选择账号')
      return
    }

    const no = await ensureProductNo()
    if (!no) {
      toast.warning('缺少商品货号，无法自动下单')
      return
    }

    autoOrder = {
      targetPrice,
      num: Math.max(1, Math.floor(Number(num.value) || 1)),
      payTool: payTool.value,
      ...(addressId.value ? { addressId: addressId.value } : {}),
      ...(selectedSkus.value.length > 0 ? { skus: selectedSkus.value } : {}),
    }
  }

  const taskId = await createPriceMonitorTask(displayProduct.value, {
    interval,
    duration: duration.value,
    notifyOn: notifyOn.value,
    minPriceDelta: Number.isFinite(minPriceDelta) && minPriceDelta > 0 ? minPriceDelta : 0.01,
    ...(autoOrder ? { autoOrder } : {}),
  })

  if (taskId) {
    emit('created', taskId)
    handleClose()
  }
}

// 每次打开时重置状态
watch(
  () => props.open,
  (open) => {
    if (!open) {
      return
    }

    intervalInput.value = String(MIN_PRICE_MONITOR_INTERVAL)
    duration.value = DEFAULT_PRICE_MONITOR_DURATION
    notifyOn.value = 'any'
    minPriceDeltaInput.value = '0.01'
    intervalError.value = ''
    // 默认只发提醒，自动下单要显式打开
    autoOrderEnabled.value = false
    targetPriceInput.value = ''
    targetPriceError.value = ''
    num.value = 1
    payTool.value = '4'
    productNo.value = props.product?.productNo || ''
    addresses.value = []
    addressId.value = ''
    addressError.value = ''
    skus.value = []
    selectedSkus.value = []
    skuError.value = ''
    precheck.value = null
  }
)

// 打开自动下单时才去取规格与地址，纯价格监控不必请求一手
watch(autoOrderEnabled, async (enabled) => {
  precheck.value = null
  if (!enabled || !hasCredential.value) {
    return
  }

  const no = await ensureProductNo()
  if (!no) {
    skuError.value = '缺少商品货号，无法选择规格'
    return
  }

  if (skus.value.length === 0) {
    loadSkus(no)
  }
  if (addresses.value.length === 0) {
    loadAddresses()
  }
})

// 直接刷新后立刻打开开关时，当前账号可能还在拉取中：
// 配置到达后补加载一次，避免规格/地址一直是空的
watch(hasCredential, async (value) => {
  if (!value || !autoOrderEnabled.value) {
    return
  }

  const no = await ensureProductNo()
  if (!no) {
    return
  }

  if (skus.value.length === 0) {
    loadSkus(no)
  }
  if (addresses.value.length === 0) {
    loadAddresses()
  }
})
</script>
