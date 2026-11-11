<template>
  <UiDialog
    :open="open"
    title="到货监控"
    @update:open="handleOpenChange"
  >
    <div class="space-y-5">
      <!-- 商品摘要 -->
      <div v-if="product" class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
        <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
          <img
            v-if="product.productImage"
            :src="product.productImage"
            :alt="product.productName"
            class="w-full h-full object-cover"
          >
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 truncate">
            {{ product.productName || product.productId }}
          </p>
          <p class="text-xs text-gray-500">货号：{{ product.productNo || '-' }}</p>
        </div>
      </div>

      <!-- 监控时长：普通到货监控与自动下单共用 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">监控时长</label>
        <select
          v-model.number="duration"
          :disabled="isLoading"
          class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option v-for="option in durationOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <p class="mt-1 text-xs text-gray-400">到时间自动停止；检测到有货会立即结束</p>
      </div>

      <!-- 监控规格：不选表示任意规格有货都算 -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="block text-sm font-medium text-gray-700">
            监控规格
            <span class="ml-1 text-xs font-normal text-gray-400">不选则监控全部规格</span>
          </label>
          <div class="flex items-center gap-2 text-xs">
            <button
              type="button"
              class="text-blue-600 hover:underline disabled:text-gray-300"
              :disabled="isLoadingSkus || skus.length === 0"
              @click="selectAllSkus"
            >
              全选
            </button>
            <button
              type="button"
              class="text-gray-500 hover:underline disabled:text-gray-300"
              :disabled="selectedSkus.length === 0"
              @click="selectedSkus = []"
            >
              清空
            </button>
          </div>
        </div>

        <div v-if="!hasCredential" class="py-2 text-xs text-amber-600">
          选择具体规格需要一手登录态（查 SKU 明细的接口不支持匿名）。不选则监控全部规格，走匿名检测更快。
        </div>
        <div v-else-if="isLoadingSkus" class="py-2 text-xs text-gray-500">加载规格中…</div>
        <div v-else-if="skuError" class="py-2 text-xs text-amber-600">
          {{ skuError }}（将监控全部规格）
        </div>
        <div v-else-if="skus.length === 0" class="py-2 text-xs text-gray-500">
          {{ product?.productNo ? '暂未读取到规格，将监控全部规格' : '缺少货号，无法选择规格，将监控全部规格' }}
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
          只在选中的 {{ selectedSkus.length }} 个规格有货时提醒 / 下单（多个规格有货会合并成一单）；选规格会使用登录态检测（15 秒一轮），比匿名检测慢
        </p>
      </div>

      <!-- 自动下单只是到货监控的一个可选配置 -->
      <div
        class="rounded-lg border p-3 transition-colors"
        :class="autoOrderEnabled ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200'"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900">有货自动下单</p>
            <p class="mt-0.5 text-xs text-gray-500">
              开启后检测到有货会自动创建待付款订单，否则只发邮件提醒
            </p>
          </div>
          <UiSwitch
            :model-value="autoOrderEnabled"
            @update:model-value="(v) => (autoOrderEnabled = toBoolean(v))"
          />
        </div>
      </div>

      <!-- 普通到货监控 -->
      <div
        v-if="!autoOrderEnabled"
        class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800"
      >
        检测到有货后发送邮件提醒，不会自动下单；无需一手登录态。
      </div>

      <!-- 自动下单配置 -->
      <template v-else>
        <div
          v-if="!hasCredential"
          class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
        >
          自动下单必须使用登录态，请先在
          <NuxtLink to="/accounts" class="underline font-medium">账号管理</NuxtLink>
          中选择带登录态的账号并设为当前账号。也可以关掉开关，只做普通到货监控。
        </div>

        <template v-else>
          <!-- 购买件数 + 支付方式 -->
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
              <p v-else-if="(precheck.items?.length || 0) > 1" class="mt-1 text-xs">
                {{ precheck.items?.length }} 个规格合并成一个订单，共 {{ precheck.num }} 件
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

          <!-- 风险说明 -->
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
            <p class="font-medium">下单后需要你手动付款</p>
            <p class="text-xs">
              检测到有货会立刻加购、结算并<strong>创建待付款订单</strong>，锁住库存并邮件通知你。
              系统不会自动扣款，一手待付款订单约 <strong>20 分钟</strong>内有效，超时未付会自动关闭并释放库存。
            </p>
          </div>
        </template>
      </template>
    </div>

    <template #footer>
      <div class="flex gap-2 w-full">
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
          :disabled="isLoading || isChecking || !product?.productNo"
          @click="handlePrecheck"
        >
          预检
        </UiButton>
        <UiButton
          variant="primary"
          class="flex-1 whitespace-nowrap"
          :loading="isLoading"
          :disabled="!canSubmit"
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
  DEFAULT_STOCK_MONITOR_DURATION,
  STOCK_MONITOR_DURATION_OPTIONS,
  buildStockMonitorConfig,
} from '@/utils/stockMonitorConfig'
interface StockMonitorProduct {
  productId: string
  productName?: string
  productImage?: string
  productNo?: string
}

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

const props = withDefaults(defineProps<{ open: boolean; product?: StockMonitorProduct | null }>(), {
  product: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [taskId: string]
}>()

const configStore = useConfigStore()
const { createMonitorTask, isLoading } = useMonitor()
const toast = useToast()

const durationOptions = STOCK_MONITOR_DURATION_OPTIONS
const autoOrderEnabled = ref(false)
const num = ref(1)
const duration = ref<number>(DEFAULT_STOCK_MONITOR_DURATION)
const payTool = ref<'1' | '4'>('4')
const addresses = ref<AddressItem[]>([])
const addressId = ref('')
const isLoadingAddress = ref(false)
const addressError = ref('')
const isChecking = ref(false)
const precheck = ref<PrecheckResult | null>(null)
const skus = ref<SkuOption[]>([])
const selectedSkus = ref<string[]>([])
const isLoadingSkus = ref(false)
const skuError = ref('')

const hasCredential = computed(() => Boolean(configStore.activeAccount?.hasCredential))

/** 普通监控不要求登录态与货号；开启自动下单则两者都必须具备 */
const canSubmit = computed(
  () =>
    !isLoading.value &&
    (!autoOrderEnabled.value || (hasCredential.value && Boolean(props.product?.productNo)))
)

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
 * 读取规格列表
 *
 * 规格查询走服务端的匿名快照即可（与到货检测同一口径），
 * 所以纯邮件提醒的用户也能选规格；有登录态时接口会自动带上凭证。
 */
const loadSkus = async () => {
  const productNo = props.product?.productNo
  // 规格明细接口拒绝匿名：没有登录态就不发请求，直接按「全部规格」处理
  if (!productNo || !hasCredential.value || isLoadingSkus.value) {
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
    }>(`/api/stock/skus/${productNo}`)

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
  if (!props.product?.productNo) {
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
        goodsId: props.product.productId,
        goodsNo: props.product.productNo,
        num: num.value,
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

const handleSubmit = async () => {
  if (!props.product) {
    return
  }

  const config = buildStockMonitorConfig({
    duration: duration.value,
    autoOrderEnabled: autoOrderEnabled.value,
    num: num.value,
    payTool: payTool.value,
    addressId: addressId.value || undefined,
    skus: selectedSkus.value,
  })

  const taskId = await createMonitorTask(
    {
      productId: props.product.productId,
      productName: props.product.productName || '',
      productImage: props.product.productImage,
    },
    config
  )

  if (taskId) {
    emit('created', taskId)
    emit('update:open', false)
  }
}

const handleClose = () => {
  emit('update:open', false)
}

const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

// 每次打开回到安全的默认：只发提醒、不自动下单，规格回到「全部」
watch(
  () => props.open,
  (open) => {
    if (open) {
      autoOrderEnabled.value = false
      precheck.value = null
      selectedSkus.value = []
      skus.value = []
      skuError.value = ''
      loadSkus()
    }
  }
)

// 只有开启自动下单且有登录态时，才去拉地址，避免普通监控白白请求一手
watch(autoOrderEnabled, (enabled) => {
  precheck.value = null
  if (enabled && hasCredential.value && addresses.value.length === 0) {
    loadAddresses()
  }
})

// 登录态没了就没法选规格：清掉已选，避免提交一个必然失败的任务
watch(hasCredential, (value) => {
  if (!value) {
    selectedSkus.value = []
    skus.value = []
    skuError.value = ''
    return
  }
  if (props.open) {
    loadSkus()
    // 配置晚到时开关可能已经打开，补拉一次地址
    if (autoOrderEnabled.value && addresses.value.length === 0) {
      loadAddresses()
    }
  }
})

watch(
  () => props.product?.productId,
  () => {
    precheck.value = null
    selectedSkus.value = []
    skus.value = []
    skuError.value = ''
    if (props.open) {
      loadSkus()
    }
  }
)
</script>
